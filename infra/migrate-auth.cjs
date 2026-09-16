'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPool, closePool } = require('../service/src/store/db');

async function main() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname, '../service/db/migrations/004-auth.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('Migrasi P4 selesai; data P3 dipertahankan.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); await closePool(); }
}
main().catch((err) => { console.error('Migrasi P4 gagal:', err); process.exitCode = 1; });
