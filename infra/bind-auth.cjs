'use strict';

const { credentials, tokenRequest } = require('./auth-dev.cjs');
const { loadConfig } = require('../service/src/config');
const { verifyAccessToken } = require('../service/src/auth/verify');
const { getPool, closePool } = require('../service/src/store/db');

const mapping = {
  'requester-a': 'acc_req_ridlo', 'requester-b': 'acc_req_siti',
  'jastiper-a': 'acc_jas_javier', 'jastiper-b': 'acc_jas_dimas',
  'admin-a': 'acc_adm_alif', 'admin-b': 'acc_adm_p4_b',
};

async function main() {
  const data = credentials();
  if (data.issuer !== loadConfig().oidc.issuer) throw new Error('Issuer configuration does not match Step 3.');
  const mcpToken = await tokenRequest(data.issuer, {
    grant_type: 'client_credentials', client_id: data.mcp.clientId,
    client_secret: data.mcp.clientSecret, scope: 'requests:read issues:read',
  });
  if (mcpToken.status !== 200) throw new Error('MCP authentication failed.');
  const mcp = await verifyAccessToken(mcpToken.json.access_token);
  if (mcp.caller_kind !== 'service' || mcp.azp !== 'titipin-mcp') throw new Error('Unexpected MCP principal.');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const [username, accountId] of Object.entries(mapping)) {
      const user = data.users.find((u) => u.username === username);
      if (!user?.subject || !user.role) throw new Error('Missing Step 3 user: ' + username);
      await client.query(
        `INSERT INTO public.accounts (account_id, display_name, role, verification_status)
         VALUES ($1, $2, $3, 'verified') ON CONFLICT (account_id) DO NOTHING`,
        [accountId, username, user.role]
      );
      const account = await client.query('SELECT role FROM public.accounts WHERE account_id = $1', [accountId]);
      if (account.rows[0].role !== user.role) throw new Error('Existing account role mismatch.');
      await client.query(
        'INSERT INTO public.auth_identities VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [data.issuer, user.subject, accountId]
      );
      const identity = await client.query('SELECT account_id FROM public.auth_identities WHERE issuer = $1 AND subject = $2', [data.issuer, user.subject]);
      if (identity.rows[0]?.account_id !== accountId) throw new Error('Existing identity binding mismatch; review it before replacing.');
    }
    // Explicit P3 demo responsibilities, not an admin-wide bypass.
    for (const [username, requestIds] of [
      ['admin-a', ['req_01_open', 'req_03_completed']],
      ['admin-b', ['req_02_transit', 'req_04_issue']],
    ]) {
      const subject = data.users.find((u) => u.username === username).subject;
      await client.query(
        `INSERT INTO public.request_access (issuer, subject, request_id)
         SELECT $1, $2, request_id FROM public.requests WHERE request_id = ANY($3::text[])
         ON CONFLICT DO NOTHING`, [data.issuer, subject, requestIds]
      );
    }
    await client.query(
      `INSERT INTO public.request_access (issuer, subject, request_id)
       SELECT $1, $2, request_id FROM public.requests WHERE request_id = 'req_04_issue'
       ON CONFLICT DO NOTHING`, [data.issuer, mcp.sub]
    );
    for (const username of ['jastiper-a', 'jastiper-b']) {
      const subject = data.users.find((u) => u.username === username).subject;
      await client.query(
        `INSERT INTO public.tracker_deliveries (issuer, subject, client_id, delivery_id)
         SELECT $1, $2, 'titipin-tracker', d.delivery_id FROM public.deliveries d
         JOIN public.assignments a ON a.assignment_id = d.assignment_id
         WHERE a.assigned_jastiper_id = $3 AND a.request_id IN ('req_02_transit', 'req_03_completed', 'req_04_issue')
         ON CONFLICT DO NOTHING`, [data.issuer, subject, mapping[username]]
      );
    }
    await client.query('COMMIT');
    console.log('Pemetaan enam user, akses admin/MCP, dan binding tracker demo P3 selesai.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await closePool(); }
}
main().catch(() => {
  console.error('Binding P4 gagal. Periksa issuer, enam user Step 3, database P3, dan migrasi 004.');
  process.exitCode = 1;
});
