'use strict';

// Read-only integration demonstration. Does not modify the P3 business records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { credentials, userToken } = require('./auth-dev.cjs');

async function main() {
  const data = credentials();
  const base = (process.env.BASE_URL || 'http://127.0.0.1:8080/v1').replace(/\/+$/, '');
  const token = await userToken(data, 'requester-a', 'requests:read requests:write');
  async function get(route, accessToken, method = 'GET') {
    const response = await fetch(base + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: accessToken ? { Authorization: 'Bearer ' + accessToken } : {},
    });
    return { status: response.status, body: await response.text() };
  }
  assert.equal((await get('/requests/req_03_completed')).status, 401);
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
  parts[1] = Buffer.from(JSON.stringify({ ...payload, sub: 'modified-subject' })).toString('base64url');
  assert.equal((await get('/requests/req_03_completed', parts.join('.'))).status, 401);
  assert.equal((await get('/deliveries/dlv_does_not_exist/locations', token, 'POST')).status, 403);
  const foreign = await get('/requests/req_02_transit', token);
  const absent = await get('/requests/req_does_not_exist', token);
  assert.equal(foreign.status, 404);
  assert.equal(absent.status, 404);
  assert.equal(foreign.body, absent.body);
  assert.equal((await get('/requests/req_03_completed', token)).status, 200);
  const health = await fetch(new URL('/health', base), { signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200);
  console.log('PASS: no token 401; modified token 401; missing scope 403; foreign and absent object identical 404; own object and health 200.');
  const evidence = { recordedAt: new Date().toISOString(), baseUrl: base,
    noToken: 401, modifiedToken: 401, missingScope: 403, foreignObject: 404,
    absentObject: 404, identical404Bodies: true, ownObject: 200, health: 200 };
  const file = path.resolve(__dirname, '../docs/evidence/step12-demo.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
}
main().catch((err) => {
  console.error('Demonstrasi belum lulus:', err);
  process.exitCode = 1;
});
