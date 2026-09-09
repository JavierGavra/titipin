const { createHash } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError, buildProblem } = require('../problem');

// P3 belum memiliki autentikasi; semua pemanggil memakai satu namespace.
const actorScope = 'anonymous:p3';

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }

  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonicalJson(value[key])
    ).join(',') + '}';
  }

  return JSON.stringify(value);
}

async function runIdempotent({ key, method, uri, body, execute }) {
  key = key.toLowerCase();

  const hash = createHash('sha256')
    .update(canonicalJson(body))
    .digest('hex');

  const lockId = createHash('sha256')
    .update(actorScope + ':' + key)
    .digest()
    .readBigInt64BE(0)
    .toString();

  const client = await getPool().connect();
  let inTransaction = false;
  let releaseError;

  try {
    // Reservasi singkat: binding key tetap ada jika proses terhenti.
    await client.query(
      `INSERT INTO public.idempotency_keys
         (actor_scope, idempotency_key, request_method, request_uri, request_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (actor_scope, idempotency_key) DO UPDATE SET
         request_method = EXCLUDED.request_method,
         request_uri = EXCLUDED.request_uri,
         request_hash = EXCLUDED.request_hash,
         status = 'in_progress',
         response_status = NULL,
         response_headers = NULL,
         response_body = NULL,
         completed_at = NULL,
         created_at = EXCLUDED.created_at,
         expires_at = EXCLUDED.expires_at
       WHERE idempotency_keys.expires_at <= CURRENT_TIMESTAMP`,
      [actorScope, key, method, uri, hash]
    );

    await client.query('BEGIN');
    inTransaction = true;

    const lock = await client.query(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS locked',
      [lockId]
    );

    const saved = await client.query(
      `SELECT request_method, request_uri, request_hash, status,
              response_status, response_headers, response_body
       FROM public.idempotency_keys
       WHERE actor_scope = $1 AND idempotency_key = $2`,
      [actorScope, key]
    );

    const record = saved.rows[0];

    if (
      record.request_method !== method ||
      record.request_uri !== uri ||
      record.request_hash !== hash
    ) {
      throw new ProblemError('idempotency-key-reuse', {
        extensions: {
          originalRequestUri: record.request_uri,
        },
      });
    }

    if (record.status === 'completed') {
      await client.query('COMMIT');
      inTransaction = false;

      return {
        status: record.response_status,
        headers: record.response_headers,
        body: record.response_body,
      };
    }

    if (!lock.rows[0].locked) {
      throw new ProblemError('idempotency-request-in-progress', {
        retryAfterSeconds: 2,
        extensions: {
          retryAfterSeconds: 2,
        },
      });
    }

    // Efek bisnis dan respons disimpan dalam transaksi yang sama.
    await client.query('SAVEPOINT mutation');
    let response;

    try {
      response = await execute(client);
    } catch (error) {
      if (!(error instanceof ProblemError)) {
        throw error;
      }

      await client.query('ROLLBACK TO SAVEPOINT mutation');

      const problem = buildProblem(error.code, error.options);

      response = {
        status: problem.status,
        headers: {
          'Content-Type': 'application/problem+json',
        },
        body: JSON.stringify(problem),
      };
    }

    await client.query(
      `UPDATE public.idempotency_keys
       SET status = 'completed',
           response_status = $3,
           response_headers = $4::jsonb,
           response_body = $5,
           completed_at = CURRENT_TIMESTAMP
       WHERE actor_scope = $1 AND idempotency_key = $2`,
      [
        actorScope,
        key,
        response.status,
        JSON.stringify(response.headers),
        response.body,
      ]
    );

    await client.query('COMMIT');
    inTransaction = false;

    return response;
  } catch (error) {
    if (!(error instanceof ProblemError)) {
      releaseError = error;
    }

    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseError = rollbackError;
      }
    }

    throw error;
  } finally {
    client.release(releaseError);
  }
}

module.exports = { runIdempotent };