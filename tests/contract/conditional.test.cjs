'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { boot } = require('../helpers/harness.cjs');

let h;
let requester;
let jastiper;

before(async () => {
  h = await boot();
  requester = await h.tokens.sign('requester-a', ['requests:read', 'requests:write']);
  jastiper = await h.tokens.sign('jastiper-a', ['requests:read', 'requests:fulfil', 'deliveries:write'], { role: 'jastiper' });
});

after(async () => { if (h) await h.close(); });

test('GET mengeluarkan ETag dan If-None-Match menghasilkan 304', async () => {
  const first = await h.request('/v1/requests?limit=20', requester);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const second = await h.request('/v1/requests?limit=20', requester, { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
  assert.equal(second.text, '');
  assert.equal(second.headers.get('etag'), etag);
});

test('dua penulisan dengan ETag lama menghasilkan satu 201 dan satu 412', async () => {
  const snapshot = await h.request('/v1/deliveries/dlv_assigned_a', jastiper);
  assert.equal(snapshot.status, 200);
  const etag = snapshot.headers.get('etag');
  assert.ok(etag);
  const point = { latitude: -6.2, longitude: 106.8, recordedAt: '2026-09-20T12:00:00Z' };
  const post = (key) => h.request('/v1/deliveries/dlv_assigned_a/locations', jastiper, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, 'If-Match': etag },
    body: JSON.stringify(point),
  });
  const first = await post(randomUUID());
  const second = await post(randomUUID());
  assert.equal(first.status, 201);
  assert.equal(second.status, 412);
  assert.equal(second.body.status, 412);
});

test('CORS hanya mengizinkan origin yang tercantum', async () => {
  const allowed = await h.request('/v1/requests', null, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const other = await h.request('/v1/requests', null, { method: 'OPTIONS', headers: { Origin: 'https://attacker.example', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(other.status, 204);
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});
