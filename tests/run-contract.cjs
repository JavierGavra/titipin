'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { boot } = require('./helpers/harness.cjs');

async function main() {
  const h = await boot();
  try {
    const token = await h.tokens.sign('requester-a', ['requests:read', 'requests:write']);
    const files = readdirSync('tests/contract').filter((f) => f.endsWith('.test.cjs')).sort();
    const child = spawn(process.execPath, [
      '--require', path.resolve(__dirname, 'helpers/inject-token.cjs'),
      '--test', ...files.map((f) => 'tests/contract/' + f),
    ], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: h.base + '/v1', TEST_ACCESS_TOKEN: token },
    });
    process.exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    });
  } finally { await h.close(); }
}

main().catch(() => { console.error('Contract runner failed; check isolated test configuration.'); process.exitCode = 1; });
