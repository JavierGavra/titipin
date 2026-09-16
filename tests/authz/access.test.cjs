'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { boot } = require('../helpers/harness.cjs');

let h;
let requesterA, requesterB, jastiperA, jastiperB, adminA, adminB;
before(async () => {
  h = await boot();
  requesterA = await h.tokens.sign('requester-a', ['requests:read', 'requests:write']);
  requesterB = await h.tokens.sign('requester-b', ['requests:read', 'requests:write']);
  jastiperA = await h.tokens.sign('jastiper-a', ['requests:read', 'requests:fulfil', 'deliveries:write'], { role: 'jastiper' });
  jastiperB = await h.tokens.sign('jastiper-b', ['requests:read', 'requests:fulfil', 'deliveries:write'], { role: 'jastiper' });
  adminA = await h.tokens.sign('admin-a', ['requests:read'], { role: 'admin' });
  adminB = await h.tokens.sign('admin-b', ['requests:read'], { role: 'admin' });
});
after(async () => { if (h) await h.close(); });
const post = (body, key = randomUUID()) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
});
const point = { latitude: -6.2, longitude: 106.8, recordedAt: '2026-09-16T12:00:00Z' };

test('N1 requester cannot read another requester object', async () => {
  assert.equal((await h.request('/v1/requests/req_assigned_b', requesterB)).status, 200);
  const denied = await h.request('/v1/requests/req_assigned_b', requesterA);
  const absent = await h.request('/v1/requests/req_missing_1234', requesterA);
  assert.equal(denied.status, 404);
  assert.equal(denied.text, absent.text);
  assert.ok(!Object.hasOwn(denied.body, 'requesterId'));
});

test('N2 jastiper cannot mutate another jastiper delivery', async () => {
  const snapshot = async () => ({
    delivery: (await h.db.query('SELECT * FROM public.deliveries WHERE delivery_id = $1', ['dlv_assigned_a'])).rows,
    locations: (await h.db.query('SELECT * FROM public.location_updates')).rows,
    keys: (await h.db.query('SELECT * FROM public.idempotency_keys')).rows,
  });
  const beforeState = await snapshot();
  const denied = await h.request('/v1/deliveries/dlv_assigned_a/locations', jastiperB, post(point));
  assert.equal(denied.status, 404);
  assert.deepEqual(await snapshot(), beforeState);
  assert.equal((await h.request('/v1/deliveries/dlv_assigned_a/locations', jastiperA, post(point))).status, 201);
});

test('N3 requester lacks jastiper scope before any database query', async () => {
  const count = h.queryCount();
  h.setDatabaseUnavailable(true);
  try {
    const response = await h.request('/v1/deliveries/dlv_assigned_a/locations', requesterA, post(point));
    assert.equal(response.status, 403);
    assert.match(response.headers.get('www-authenticate'), /insufficient_scope.*deliveries:write/);
    assert.equal(h.queryCount(), count);
  } finally { h.setDatabaseUnavailable(false); }
});

test('N4 admin cannot read outside operational responsibility', async () => {
  assert.equal((await h.request('/v1/assignments/asg_assigned_b', adminB)).status, 200);
  const denied = await h.request('/v1/assignments/asg_assigned_b', adminA);
  const absent = await h.request('/v1/assignments/asg_missing_1234', adminA);
  assert.equal(denied.status, 404);
  assert.equal(denied.text, absent.text);
});

test('Layer 1 rejects absent, modified, expired and wrong-context tokens without SQL', async () => {
  const parts = requesterA.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  parts[1] = Buffer.from(JSON.stringify({ ...claims, sub: 'requester-b' })).toString('base64url');
  const rawNone = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url') + '.' + parts[1] + '.';
  const invalid = [null, 'not-a-token', parts.join('.'), rawNone,
    await h.tokens.sign('requester-a', ['requests:read'], { exp: 1 }),
    await h.tokens.sign('requester-a', ['requests:read'], { exp: undefined }),
    await h.tokens.sign('requester-a', ['requests:read'], { iss: 'https://wrong.example' }),
    await h.tokens.sign('requester-a', ['requests:read'], { aud: 'another-api' }),
  ];
  const count = h.queryCount();
  h.setDatabaseUnavailable(true);
  try {
    for (const token of invalid) {
      const response = await h.request('/v1/requests/req_assigned_a', token);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
    }
    assert.equal((await h.request('/health', null)).status, 200);
    assert.equal(h.queryCount(), count);
  } finally { h.setDatabaseUnavailable(false); }
});

test('Collections filter before pagination and represent jastiper prospects minimally', async () => {
  const first = await h.request('/v1/requests?limit=1', requesterA);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 1);
  assert.equal(first.body.items[0].requesterId, 'acc_requester_a');
  assert.equal(first.body.page.hasMore, true);
  const second = await h.request('/v1/requests?limit=1&cursor=' + encodeURIComponent(first.body.page.nextCursor), requesterA);
  assert.equal(second.body.items[0].requesterId, 'acc_requester_a');
  assert.notEqual(first.body.items[0].requestId, second.body.items[0].requestId);
  const prospect = await h.request('/v1/requests/req_open_b', jastiperA);
  assert.equal(prospect.status, 200);
  assert.ok(!Object.hasOwn(prospect.body, 'requesterId'));
  assert.ok(!Object.hasOwn(prospect.body, 'deliveryAddress'));
  assert.equal((await h.request('/v1/assignments/asg_assigned_b', jastiperA)).status, 404);
  const adminPage = await h.request('/v1/requests', adminA);
  assert.deepEqual(adminPage.body.items.map((r) => r.requestId), ['req_assigned_a']);
});

test('Selection protects parent, body reference, replay, and actor namespace', async () => {
  const key = randomUUID();
  const uri = '/v1/requests/req_open_a/assignments';
  assert.equal((await h.request(uri, requesterB, post({ offerId: 'off_open_a' }, key))).status, 404);
  assert.equal((await h.request(uri, requesterA, post({ offerId: 'off_open_b' }))).status, 404);
  const created = await h.request(uri, requesterA, post({ offerId: 'off_open_a' }, key));
  assert.equal(created.status, 201);
  const replay = await h.request(uri, requesterA, post({ offerId: 'off_open_a' }, key));
  assert.equal(replay.status, 201);
  assert.equal(replay.text, created.text);
  assert.equal(replay.headers.get('location'), created.headers.get('location'));
  const other = await h.request('/v1/requests/req_open_b/assignments', requesterB, post({ offerId: 'off_open_b' }, key));
  assert.equal(other.status, 201);
  assert.notEqual(other.body.assignmentId, created.body.assignmentId);
  await h.db.query('DELETE FROM public.auth_identities WHERE subject = $1', ['requester-a']);
  assert.equal((await h.request(uri, requesterA, post({ offerId: 'off_open_a' }, key))).status, 404);
  assert.equal((await h.db.query('SELECT count(*)::int AS n FROM public.assignments WHERE request_id = $1', ['req_open_a'])).rows[0].n, 1);
});

test('Tracker requires binding and current assigned jastiper; MCP has no global bypass', async () => {
  const tracker = await h.tokens.sign('jastiper-a', ['deliveries:write'], { role: 'jastiper', kind: 'tracker', clientId: 'titipin-tracker' });
  assert.equal((await h.request('/v1/deliveries/dlv_assigned_b/locations', tracker, post(point))).status, 404);
  assert.equal((await h.request('/v1/deliveries/dlv_assigned_a/locations', tracker, post(point))).status, 201);
  const mcp = await h.tokens.sign('service-mcp', ['requests:read'], { role: 'mcp-reader', kind: 'service', clientId: 'titipin-mcp' });
  assert.equal((await h.request('/v1/requests/req_assigned_a', mcp)).status, 404);
  await h.db.query('INSERT INTO public.request_access VALUES ($1, $2, $3)', [h.tokens.issuer, 'service-mcp', 'req_assigned_a']);
  const granted = await h.request('/v1/requests/req_assigned_a', mcp);
  assert.equal(granted.status, 200);
  assert.ok(!Object.hasOwn(granted.body, 'deliveryAddress'));
});
