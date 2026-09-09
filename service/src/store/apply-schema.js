const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { getPool, closePool } = require('./db');

async function applySchema() {
  let client;
  let transactionStarted = false;
  let releaseError;

  try {
    const sql = await readFile(
      path.resolve(__dirname, '../../db/schema.sql'),
      'utf8'
    );

    client = await getPool().connect();

    await client.query('BEGIN');
    transactionStarted = true;

    await client.query(sql);

    await client.query('COMMIT');
    transactionStarted = false;

    console.log('Schema berhasil diterapkan pada database tujuan.');
  } catch (error) {
    releaseError = error;

    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseError = rollbackError;
      }
    }

    throw error;
  } finally {
    if (client) {
      client.release(releaseError);
    }

    await closePool();
  }
}

if (require.main === module) {
  applySchema().catch((error) => {
    console.error('Penerapan schema gagal:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { applySchema };