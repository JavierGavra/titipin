import { config } from './config.js';

const etags = new Map();
const cache = new Map();
let hooks = {
  getAccessToken: () => null,
  refreshSession: async () => false,
  onSessionExpired: () => {},
};

export class ProblemError extends Error {
  constructor({ status = 0, type = '', title = 'Request failed', detail = '', invalidParams = [], code = '' } = {}) {
    super(detail || title);
    this.name = 'ProblemError';
    this.status = status;
    this.type = type;
    this.title = title;
    this.detail = detail || title;
    this.invalidParams = Array.isArray(invalidParams) ? invalidParams : [];
    this.code = code || type.split('/').at(-1) || '';
    this.willRetry = status === 0 || status >= 500;
  }
}

export function configureApi(nextHooks) {
  hooks = { ...hooks, ...nextHooks };
}

function urlFor(path) {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  if (!base) throw new ProblemError({ status: 0, title: 'Konfigurasi API belum diisi', detail: 'Set VITE_API_BASE_URL sebelum menjalankan aplikasi web.' });
  return `${base}/${String(path).replace(/^\//, '')}`;
}

function normalizeInvalidParams(body) {
  return body?.['invalid-params'] || body?.invalidParameters || body?.invalidParams || [];
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { detail: text }; }
}

function problemFromResponse(response, body) {
  const fallback = response.status === 401
    ? 'Sesi tidak berlaku. Silakan masuk kembali.'
    : response.status === 403
      ? 'Akun ini belum memiliki izin untuk tindakan tersebut.'
      : response.status === 404
        ? 'Data yang diminta tidak ditemukan.'
        : response.status === 412
          ? 'Data ini sudah berubah karena diproses lebih dulu oleh pengguna lain.'
          : 'Permintaan belum dapat diproses.';
  return new ProblemError({
    status: response.status,
    type: body?.type || '',
    title: body?.title || `HTTP ${response.status}`,
    detail: body?.detail || fallback,
    invalidParams: normalizeInvalidParams(body),
    code: body?.code || '',
  });
}

function makeHeaders({ body, idempotencyKey, ifMatch, ifNoneMatch, headers = {} }) {
  const result = new Headers(headers);
  const token = hooks.getAccessToken();
  if (token) result.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) result.set('Content-Type', 'application/json');
  if (idempotencyKey) result.set('Idempotency-Key', idempotencyKey);
  if (ifMatch) result.set('If-Match', ifMatch);
  if (ifNoneMatch) result.set('If-None-Match', ifNoneMatch);
  return result;
}

function newIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function invalidate(cacheKey) {
  if (!cacheKey) return;
  for (const key of cache.keys()) {
    if (key === cacheKey || key.startsWith(`${cacheKey}?`) || key.startsWith(cacheKey.split('?')[0])) cache.delete(key);
  }
  for (const key of etags.keys()) {
    if (key === cacheKey || key.startsWith(cacheKey.split('?')[0])) etags.delete(key);
  }
}

async function request(path, options = {}, retry = true) {
  const {
    method = 'GET', body, cacheKey = path, conditional = false, idempotent = false,
    ifMatch, headers, signal,
  } = options;
  const savedEtag = conditional ? etags.get(cacheKey) : undefined;
  let response;
  try {
    response = await fetch(urlFor(path), {
      method,
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: makeHeaders({ body, idempotencyKey: idempotent ? newIdempotencyKey() : undefined, ifMatch,
        ifNoneMatch: savedEtag, headers }),
      signal,
      redirect: 'error',
    });
  } catch (error) {
    if (savedEtag && method === 'GET' && retry) {
      etags.delete(cacheKey);
      return request(path, { ...options, conditional: false }, false);
    }
    throw new ProblemError({ status: 0, title: 'Koneksi gagal', detail: 'Layanan Titipin tidak dapat dijangkau. Periksa koneksi lalu coba lagi.' });
  }

  if (response.status === 401 && retry) {
    const refreshed = await hooks.refreshSession();
    if (refreshed) return request(path, options, false);
  }

  if (response.status === 401) {
    hooks.onSessionExpired();
  }

  if (response.status === 304) {
    const previous = cache.get(cacheKey);
    return { data: previous?.data || { items: [], page: { limit: 0, nextCursor: null, hasMore: false } },
      etag: savedEtag, fetchedAt: previous?.fetchedAt || new Date(), notModified: true };
  }

  const bodyData = await readBody(response);
  if (!response.ok) throw problemFromResponse(response, bodyData);

  const etag = response.headers.get('ETag') || undefined;
  if (etag) etags.set(cacheKey, etag);
  const result = { data: bodyData, etag, fetchedAt: new Date(), notModified: false };
  if (method === 'GET') cache.set(cacheKey, result);
  else invalidate(cacheKey);
  return result;
}

export async function exchangeCode({ code, codeVerifier }) {
  const endpoint = `${config.oidcIssuer.replace(/\/$/, '')}/protocol/openid-connect/token`;
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.oidcClientId,
    redirect_uri: globalThis.__TITIPIN_CONFIG__?.oidcRedirectUri || `${window.location.origin}/callback`,
    code,
    code_verifier: codeVerifier,
  });
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'error' });
  const data = await readBody(response);
  if (!response.ok || !data?.access_token) throw problemFromResponse(response, data);
  return data;
}

export async function refreshAccessToken(refreshToken) {
  const endpoint = `${config.oidcIssuer.replace(/\/$/, '')}/protocol/openid-connect/token`;
  const form = new URLSearchParams({ grant_type: 'refresh_token', client_id: config.oidcClientId, refresh_token: refreshToken });
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'error' });
  const data = await readBody(response);
  if (!response.ok || !data?.access_token) return null;
  return data;
}

export function listRequests({ status, cursor, limit = 20, conditional = true } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  const path = `/requests?${params}`;
  return request(path, { cacheKey: path, conditional });
}

export function getRequest(requestId) {
  return request(`/requests/${encodeURIComponent(requestId)}`, { cacheKey: `/requests/${requestId}` });
}

export function createRequest(body) {
  return request('/requests', { method: 'POST', body, idempotent: true, cacheKey: '/requests' });
}

export function listOffers(requestId, { conditional = true } = {}) {
  const path = `/requests/${encodeURIComponent(requestId)}/offers?limit=50`;
  return request(path, { cacheKey: path, conditional });
}

export function createOffer(requestId, body, ifMatch) {
  return request(`/requests/${encodeURIComponent(requestId)}/offers`, { method: 'POST', body, idempotent: true, ifMatch, cacheKey: `/requests/${requestId}/offers` });
}

export function selectOffer(requestId, offerId, ifMatch) {
  return request(`/requests/${encodeURIComponent(requestId)}/assignments`, { method: 'POST', body: { offerId }, idempotent: true, ifMatch, cacheKey: `/requests/${requestId}` });
}

export function getAssignment(assignmentId) {
  return request(`/assignments/${encodeURIComponent(assignmentId)}`, { cacheKey: `/assignments/${assignmentId}` });
}

export function createPayment(assignmentId, method, ifMatch) {
  return request(`/assignments/${encodeURIComponent(assignmentId)}/payments`, { method: 'POST', body: { method }, idempotent: true, ifMatch, cacheKey: `/assignments/${assignmentId}` });
}

export function getPayment(paymentId) {
  return request(`/payments/${encodeURIComponent(paymentId)}`, { cacheKey: `/payments/${paymentId}` });
}

export function createDelivery(assignmentId, purchaseRecordedAt, ifMatch) {
  return request(`/assignments/${encodeURIComponent(assignmentId)}/deliveries`, { method: 'POST', body: { purchaseRecordedAt }, idempotent: true, ifMatch, cacheKey: `/assignments/${assignmentId}` });
}

export function getDelivery(deliveryId) {
  return request(`/deliveries/${encodeURIComponent(deliveryId)}`, { cacheKey: `/deliveries/${deliveryId}` });
}

export function listLocations(deliveryId, { conditional = true } = {}) {
  const path = `/deliveries/${encodeURIComponent(deliveryId)}/locations?limit=50`;
  return request(path, { cacheKey: path, conditional });
}

export function createLocation(deliveryId, body, ifMatch) {
  return request(`/deliveries/${encodeURIComponent(deliveryId)}/locations`, { method: 'POST', body, idempotent: true, ifMatch, cacheKey: `/deliveries/${deliveryId}` });
}

export function confirmReceipt(deliveryId, body, ifMatch) {
  return request(`/deliveries/${encodeURIComponent(deliveryId)}/receipt-confirmations`, { method: 'POST', body, idempotent: true, ifMatch, cacheKey: `/deliveries/${deliveryId}` });
}

export function listIssues({ status, cursor, limit = 50, conditional = true } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  const path = `/issues?${params}`;
  return request(path, { cacheKey: path, conditional });
}

export function getIssue(issueId) {
  return request(`/issues/${encodeURIComponent(issueId)}`, { cacheKey: `/issues/${issueId}` });
}

export function resolveIssue(issueId, body, ifMatch) {
  return request(`/issues/${encodeURIComponent(issueId)}/resolutions`, { method: 'POST', body, idempotent: true, ifMatch, cacheKey: `/issues/${issueId}` });
}

export function invalidateCaches() {
  cache.clear();
  etags.clear();
}
