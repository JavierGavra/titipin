'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('Startup rejects missing OIDC configuration before listening', () => {
  const result = spawnSync(process.execPath, ['service/src/app.js'], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, PORT: '8080', HTTP_HOST: '127.0.0.1', OIDC_ISSUER: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OIDC_ISSUER/);
  assert.ok(!result.stdout.includes('started'));
});
