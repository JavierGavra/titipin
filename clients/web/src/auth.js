import { config, redirectUri } from './config.js';
import { exchangeCode, refreshAccessToken } from './api.js';

const SESSION_KEY = 'titipin.web.session.v1';
const PENDING_KEY = 'titipin.web.pkce.pending.v1';

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function decodePayload(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(payload).split('').map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`).join('')));
  } catch { return {}; }
}

function userFromToken(accessToken) {
  const payload = decodePayload(accessToken);
  const roles = Array.isArray(payload.realm_access?.roles) ? payload.realm_access.roles : [];
  const role = ['requester', 'jastiper', 'admin'].find((candidate) => roles.includes(candidate)) || 'user';
  return { role, roles, subject: payload.sub || '', name: payload.name || payload.preferred_username || role };
}

export function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!session?.accessToken || !session.expiresAt) return null;
    return session;
  } catch { return null; }
}

function saveTokens(tokens) {
  const current = getSession();
  const session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || current?.refreshToken || null,
    expiresAt: Date.now() + Number(tokens.expires_in || 300) * 1000,
    user: userFromToken(tokens.access_token),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function accessToken() { return getSession()?.accessToken || null; }

export async function refreshSession() {
  const current = getSession();
  if (!current?.refreshToken) return false;
  let tokens;
  try { tokens = await refreshAccessToken(current.refreshToken); } catch { tokens = null; }
  if (!tokens) { signOut(); return false; }
  saveTokens(tokens);
  return true;
}

export async function ensureFreshSession() {
  const current = getSession();
  if (!current) return null;
  if (current.expiresAt - Date.now() < 60_000) await refreshSession();
  return getSession();
}

export async function beginLogin(returnTo = '/') {
  const state = randomString(24);
  const codeVerifier = randomString(48);
  const codeChallenge = await challengeFor(codeVerifier);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, codeVerifier, returnTo }));
  const authUrl = new URL(`${config.oidcIssuer.replace(/\/$/, '')}/protocol/openid-connect/auth`);
  authUrl.search = new URLSearchParams({
    client_id: config.oidcClientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: 'openid profile requests:read requests:write requests:fulfil payments:read accounts:read issues:read issues:write deliveries:write',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(authUrl);
}

export async function finishLogin() {
  const params = new URLSearchParams(window.location.search);
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
  if (!pending || params.get('state') !== pending.state) throw new Error('Sesi login tidak valid. Silakan mulai login lagi.');
  if (!params.get('code')) throw new Error('Authorization code tidak diterima dari penyedia login.');
  const tokens = await exchangeCode({ code: params.get('code'), codeVerifier: pending.codeVerifier });
  const session = saveTokens(tokens);
  sessionStorage.removeItem(PENDING_KEY);
  return { session, returnTo: pending.returnTo || '/' };
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(PENDING_KEY);
}

export function roleLabel(role) {
  return ({ requester: 'Pemesan', jastiper: 'Jastiper', admin: 'Admin' })[role] || role;
}
