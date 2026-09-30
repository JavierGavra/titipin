'use strict';

// Menambahkan scope requests:write, requests:fulfil, deliveries:write ke client titipin-web
// yang belum terdaftar di seed awal.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.local/auth.env');
const base = (process.env.KEYCLOAK_URL || 'http://localhost:8081').replace(/\/$/, '');
const realm = 'titipin';

function readEnv(file) {
  const fromFile = fs.existsSync(file)
    ? Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
        .filter(Boolean).map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }))
    : {};
  return {
    KC_BOOTSTRAP_ADMIN_USERNAME: process.env.KC_BOOTSTRAP_ADMIN_USERNAME || fromFile.KC_BOOTSTRAP_ADMIN_USERNAME || 'admin',
    KC_BOOTSTRAP_ADMIN_PASSWORD: process.env.KC_BOOTSTRAP_ADMIN_PASSWORD || fromFile.KC_BOOTSTRAP_ADMIN_PASSWORD,
  };
}

async function request(url, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (form !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
  const response = await fetch(url, {
    method, headers,
    body: body === undefined ? (form === undefined ? undefined : new URLSearchParams(form)) : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return response;
}

async function readJson(response, prefix) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${prefix}: Keycloak menjawab HTTP ${response.status}. ${text}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const env = readEnv(envFile);
  // Get admin token
  const tokenRes = await request(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST', form: {
      grant_type: 'password', client_id: 'admin-cli',
      username: env.KC_BOOTSTRAP_ADMIN_USERNAME, password: env.KC_BOOTSTRAP_ADMIN_PASSWORD,
    },
  });
  const tokens = await readJson(tokenRes, 'Login admin');
  const token = tokens.access_token;

  const adminUrl = (suffix = '') => `${base}/admin/realms/${realm}${suffix}`;

  // Get titipin-web client
  const clientsRes = await request(adminUrl('/clients?clientId=titipin-web'), { token });
  const clients = await readJson(clientsRes, 'Membaca clients');
  if (!clients?.length) throw new Error('Client titipin-web tidak ditemukan.');
  const webClientId = clients[0].id;
  console.log('Found titipin-web client id:', webClientId);

  // Get all client scopes
  const scopesRes = await request(adminUrl('/client-scopes'), { token });
  const allScopes = await readJson(scopesRes, 'Membaca semua scopes');
  const scopeMap = Object.fromEntries(allScopes.map(s => [s.name, s.id]));
  console.log('Available scopes:', Object.keys(scopeMap).join(', '));

  // Default scopes yang wajib ada di client OIDC
  for (const name of ['profile', 'email', 'roles', 'web-origins', 'basic', 'acr']) {
    const scopeId = scopeMap[name];
    if (scopeId) {
      await request(adminUrl(`/clients/${webClientId}/default-client-scopes/${scopeId}`), {
        method: 'PUT', token,
      });
      console.log(`OK: default scope ${name} ditambahkan.`);
    }
  }

  // Optional domain scopes yang diizinkan untuk titipin-web
  const toAdd = [
    'requests:read', 'requests:write', 'requests:fulfil', 'deliveries:write',
    'payments:read', 'accounts:read', 'issues:read', 'issues:write'
  ];

  for (const scopeName of toAdd) {
    const scopeId = scopeMap[scopeName];
    if (!scopeId) {
      console.log(`SKIP: scope ${scopeName} tidak ada di realm.`);
      continue;
    }
    const addRes = await request(adminUrl(`/clients/${webClientId}/optional-client-scopes/${scopeId}`), {
      method: 'PUT', token,
    });
    if (addRes.status === 204 || addRes.status === 200) {
      console.log(`OK: scope ${scopeName} ditambahkan ke titipin-web.`);
    } else {
      const text = await addRes.text();
      console.log(`WARN: scope ${scopeName} status ${addRes.status}: ${text}`);
    }
  }

  console.log('Selesai. Coba login lagi di http://localhost:5173');
}

main().catch((err) => { console.error('Gagal:', err.message); process.exitCode = 1; });
