'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { createLogger } = require('../../service/src/logger');

test('Logging boundary removes Authorization, cookies, token fields and JWT text', () => {
  let output = '';
  const stream = new Writable({ write(chunk, encoding, done) { output += chunk; done(); } });
  const logger = createLogger(stream);
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhIn0.fakeSignature';
  logger.info({
    req: { headers: { authorization: 'Bearer ' + jwt, cookie: 'refresh_token=opaque-secret' } },
    res: { headers: { 'set-cookie': 'refresh_token=opaque-secret' } },
    nested: { refresh_token: 'opaque-secret', client_secret: 'client-secret-value' },
  }, 'token ' + jwt);
  logger.error(new Error('Unexpected token ' + jwt), 'request failed');
  assert.ok(output.includes('[redacted]'));
  for (const secret of [jwt, 'opaque-secret', 'client-secret-value', 'Bearer ']) {
    assert.ok(!output.includes(secret));
  }
});
