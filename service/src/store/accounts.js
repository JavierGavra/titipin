'use strict';

const { getPool } = require('./db');

async function getAccountById(accountId, db = getPool()) {
  const result = await db.query(
    `SELECT account_id, display_name, role, verification_status, created_at, updated_at
     FROM public.accounts
     WHERE account_id = $1`,
    [accountId]
  );

  return result.rows[0] ?? null;
}

module.exports = { getAccountById };
