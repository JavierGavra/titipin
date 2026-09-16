'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const local = path.join(root, '.local');
const envFile = path.join(local, 'auth.env');

try {
  if (fs.existsSync(envFile)) {
    throw new Error('.local/auth.env sudah ada; script tidak menimpa kredensial lokal.');
  }

  fs.mkdirSync(local, { recursive: true, mode: 0o700 });

  const password = randomBytes(32).toString('base64url');

  fs.writeFileSync(
    envFile,
    `KC_BOOTSTRAP_ADMIN_USERNAME=admin\nKC_BOOTSTRAP_ADMIN_PASSWORD=${password}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' }
  );

  console.log('Kredensial admin development dibuat di .local/auth.env. Nilai rahasia tidak dicetak.');
} catch (error) {
  console.error('FAIL init auth: ' + error.message);
  process.exitCode = 1;
}