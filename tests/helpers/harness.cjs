'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createTokens } = require('./tokens.cjs');

async function isolatedDatabase() {
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/titipin_test') {
      throw new Error('TEST_DATABASE_URL must be a loopback PostgreSQL database named titipin_test.');
    }
    const { Pool } = require('pg');
    const control = new Pool({ connectionString: url.toString() });
    const name = 'titipin_test_' + randomUUID().replaceAll('-', '');
    await control.query(`CREATE DATABASE ${name}`);
    url.pathname = '/' + name;
    const pool = new Pool({ connectionString: url.toString() });
    return {
      pool,
      exec: (sql) => pool.query(sql),
      close: async () => {
        await pool.end();
        await control.query(`DROP DATABASE ${name} WITH (FORCE)`);
        await control.end();
      },
    };
  }
  // Real PostgreSQL compiled to WASM, not a SQL mock. Local fallback without Docker.
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  const pool = {
    query: (sql, params) => db.query(sql, params),
    connect: async () => ({ query: (sql, params) => db.query(sql, params), release() {} }),
  };
  return { pool, exec: (sql) => db.exec(sql), close: () => db.close() };
}

async function boot() {
  const database = await isolatedDatabase();
  const tokens = await createTokens();
  for (const name of ['service/db/schema.sql', 'service/db/migrations/004-auth.sql', 'tests/fixtures/auth.sql']) {
    await database.exec(fs.readFileSync(path.resolve(__dirname, '../..', name), 'utf8'));
  }
  for (const role of ['requester', 'jastiper', 'admin']) {
    for (const suffix of ['a', 'b']) {
      await database.pool.query('INSERT INTO public.auth_identities VALUES ($1, $2, $3)',
        [tokens.issuer, `${role}-${suffix}`, `acc_${role}_${suffix}`]);
    }
  }
  for (const suffix of ['a', 'b']) {
    await database.pool.query('INSERT INTO public.request_access VALUES ($1, $2, $3)',
      [tokens.issuer, `admin-${suffix}`, `req_assigned_${suffix}`]);
    await database.pool.query('INSERT INTO public.tracker_deliveries VALUES ($1, $2, $3, $4)',
      [tokens.issuer, `jastiper-${suffix}`, 'titipin-tracker', `dlv_assigned_${suffix}`]);
  }
  Object.assign(process.env, {
    PORT: '8080', HTTP_HOST: '127.0.0.1', PGHOST: '127.0.0.1', PGPORT: '5432',
    PGDATABASE: 'titipin_test', PGUSER: 'test', PGPASSWORD: 'ephemeral-test-only',
    PGSSLMODE: 'disable', DB_CONNECTION_TIMEOUT_MS: '1000', LOG_LEVEL: 'silent',
    OIDC_ISSUER: tokens.issuer, OIDC_JWKS_URI: tokens.jwksUri, OIDC_AUDIENCE: tokens.audience,
  });
  let queryCount = 0;
  let databaseUnavailable = false;
  const wrapQuery = (query) => (...args) => {
    queryCount++;
    if (databaseUnavailable) throw new Error('Database intentionally unavailable during scope/authentication tests');
    return query(...args);
  };
  const trackedPool = {
    query: wrapQuery(database.pool.query.bind(database.pool)),
    connect: async () => {
      const client = await database.pool.connect();
      return { query: wrapQuery(client.query.bind(client)), release: (error) => client.release(error) };
    },
  };
  // Test-only adapter installed before loading application modules. No test bypass in production.
  require('../../service/src/store/db').getPool = () => trackedPool;
  const app = require('../../service/src/app');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, tokens, db: database.pool,
    queryCount: () => queryCount,
    setDatabaseUnavailable(value) { databaseUnavailable = value; },
    async request(apiPath, token, options = {}) {
      const response = await fetch(base + apiPath, {
        ...options,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, body: text ? JSON.parse(text) : null };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await tokens.close();
      await database.close();
    },
  };
}

module.exports = { boot };
