'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { sendProblem } = require('../problem');

// Versi disimpan per token caller selama proses berjalan. GET mengisi versi dari
// representasi yang dilihat caller; mutasi memajukan versi setelah berhasil.
// Dengan begitu dua tab memakai ETag yang sama akan menghasilkan 412 pada tab kedua.
const versions = new Map();

function callerKey(req) {
  return createHash('sha256')
    .update(req.get('authorization') || 'anonymous')
    .digest('hex')
    .slice(0, 24);
}

function pathWithoutQuery(url) {
  return String(url || '').split('?')[0].replace(/\/$/, '') || '/';
}

function readKey(req) {
  const original = String(req.originalUrl || req.path || '').split('?')[0];
  return `${callerKey(req)}|${original}`;
}

function mutationTarget(req) {
  const path = pathWithoutQuery(req.path || req.originalUrl);
  let match;
  if ((match = /^\/v1\/requests\/([^/]+)\/(?:assignments|offers)$/.exec(path))) return `/v1/requests/${match[1]}`;
  if ((match = /^\/v1\/assignments\/([^/]+)\/(?:payments|deliveries)$/.exec(path))) return `/v1/assignments/${match[1]}`;
  if ((match = /^\/v1\/deliveries\/([^/]+)\/(?:locations|receipt-confirmations)$/.exec(path))) return `/v1/deliveries/${match[1]}`;
  if ((match = /^\/v1\/issues\/([^/]+)\/resolutions$/.exec(path))) return `/v1/issues/${match[1]}`;
  return path;
}

function mutationKey(req) {
  return `${callerKey(req)}|${mutationTarget(req)}`;
}

function makeEtag(body) {
  const source = typeof body === 'string' ? body : JSON.stringify(body);
  return `"${createHash('sha256').update(source).digest('hex')}"`;
}

function nextMutationEtag(req) {
  return makeEtag(`${mutationTarget(req)}:${Date.now()}:${randomUUID()}`);
}

function matchesEtag(header, current) {
  if (!header || !current) return false;
  if (header.trim() === '*') return true;
  return header.split(',').map((value) => value.trim().replace(/^W\//i, '')).includes(current);
}

function isMutation(req) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
}

function conditionalMiddleware(req, res, next) {
  const ifMatch = req.get('If-Match');
  const writeVersionKey = isMutation(req) ? mutationKey(req) : null;
  if (isMutation(req) && ifMatch) {
    const current = versions.get(writeVersionKey);
    // A caller that has never read the resource keeps the legacy contract. Once
    // a version has been observed, an old version must be refused.
    if (current && !matchesEtag(ifMatch, current)) {
      return sendProblem(res, 'precondition-failed', {
        detail: 'Data ini sudah berubah karena diproses lebih dulu oleh pengguna lain. Muat ulang data terbaru sebelum mencoba lagi.',
      });
    }
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (req.method === 'GET' && res.statusCode >= 200 && res.statusCode < 300) {
      const etag = makeEtag(body);
      versions.set(readKey(req), etag);
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, no-cache, must-revalidate');
      if (matchesEtag(req.get('If-None-Match'), etag)) {
        return res.status(304).end();
      }
    }
    return originalJson(body);
  };

  res.once('finish', () => {
    if (isMutation(req) && res.statusCode >= 200 && res.statusCode < 300) {
      versions.set(writeVersionKey, nextMutationEtag(req));
    }
  });

  return next();
}

function allowedOrigins() {
  return new Set(String(process.env.WEB_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean));
}

function corsMiddleware(req, res, next) {
  const origin = req.get('Origin');
  const allowed = allowedOrigins();
  if (origin && allowed.has(origin)) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, If-Match, If-None-Match',
      'Access-Control-Expose-Headers': 'ETag, Location',
      Vary: 'Origin',
    };
    res.set(corsHeaders);

    // Re-apply CORS headers right before the response is flushed to the client.
    // This guarantees they survive 304 and other short-circuit responses that
    // bypass res.json() (e.g. from conditionalMiddleware or Vercel's edge).
    const _end = res.end.bind(res);
    res.end = function (...args) {
      if (!res.headersSent) {
        for (const [k, v] of Object.entries(corsHeaders)) {
          res.setHeader(k, v);
        }
      }
      return _end(...args);
    };
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}

module.exports = { conditionalMiddleware, corsMiddleware, makeEtag, mutationTarget };
