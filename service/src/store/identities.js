'use strict';

const { getPool } = require('./db');

// Called by a handler only AFTER the scope gate. Never trust a body accountId.
async function resolveActor(principal, db = getPool()) {
  const result = await db.query(
    `SELECT a.account_id, a.role, a.verification_status
       FROM public.auth_identities i
       JOIN public.accounts a ON a.account_id = i.account_id
      WHERE i.issuer = $1 AND i.subject = $2`,
    [principal.issuer, principal.subject]
  );
  const account = result.rows[0];
  const active = account && principal.roles.includes(account.role)
    && account.verification_status !== 'suspended' && principal.kind !== 'service';
  return {
    ...principal,
    accountId: active ? account.account_id : null,
    role: active ? account.role : null,
    verificationStatus: active ? account.verification_status : null,
  };
}

module.exports = { resolveActor };
