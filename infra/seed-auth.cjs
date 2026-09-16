'use strict';

// Menyiapkan realm Titipin setelah container Keycloak lokal sudah berjalan.
// Semua password user uji dan secret MCP hanya disimpan dalam .local/.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const local = path.join(root, '.local');
const envFile = path.join(local, 'auth.env');
const credentialsFile = path.join(local, 'auth-credentials.json');
const base = 'http://localhost:8081';
const realm = 'titipin';
const issuer = `${base}/realms/${realm}`;
const audience = 'titipin-api';

const scopes = {
  'requests:read': {
    description: 'Membaca resource alur transaksi yang diizinkan.',
    roles: ['requester', 'jastiper', 'admin', 'mcp-reader'],
  },
  'requests:write': {
    description: 'Menjalankan tindakan pemesan pada transaksi sendiri.',
    roles: ['requester'],
  },
  'requests:fulfil': {
    description: 'Menjalankan tindakan pemenuhan oleh jastiper.',
    roles: ['jastiper'],
  },
  'deliveries:write': {
    description: 'Mengirim pembaruan lokasi pengantaran yang diizinkan.',
    roles: ['jastiper'],
  },
  'payments:read': {
    description: 'Membaca catatan pembayaran simulasi yang diizinkan.',
    roles: ['requester', 'jastiper', 'admin'],
  },
  'accounts:read': {
    description: 'Membaca profil akun terbatas yang diizinkan.',
    roles: ['requester', 'jastiper', 'admin'],
  },
  'issues:read': {
    description: 'Membaca masalah transaksi dalam kewenangan operasional.',
    roles: ['admin', 'mcp-reader'],
  },
  'issues:write': {
    description: 'Melaporkan atau menyelesaikan masalah sesuai peran.',
    roles: ['requester', 'jastiper', 'admin'],
  },
};

const allScopes = Object.keys(scopes);
const users = [
  ['requester-a', 'requester'],
  ['requester-b', 'requester'],
  ['jastiper-a', 'jastiper'],
  ['jastiper-b', 'jastiper'],
  ['admin-a', 'admin'],
  ['admin-b', 'admin'],
];

function readEnv(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(Boolean).map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }));
}

function safeError(prefix, response) {
  return new Error(`${prefix}: Keycloak menjawab HTTP ${response.status}.`);
}

async function request(url, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (form !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? (form === undefined ? undefined : new URLSearchParams(form)) : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return response;
}

async function readJson(response, prefix) {
  if (!response.ok) throw safeError(prefix, response);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function adminToken(env) {
  const response = await request(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST', form: {
      grant_type: 'password', client_id: 'admin-cli',
      username: env.KC_BOOTSTRAP_ADMIN_USERNAME, password: env.KC_BOOTSTRAP_ADMIN_PASSWORD,
    },
  });
  const tokens = await readJson(response, 'Login admin');
  if (!tokens?.access_token) throw new Error('Login admin tidak menghasilkan access token.');
  return tokens.access_token;
}

async function waitForAdmin(env) {
  let last;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try { return await adminToken(env); } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Keycloak belum siap setelah 60 detik. ${last?.message || ''}`.trim());
}

function adminUrl(suffix = '') { return `${base}/admin/realms/${realm}${suffix}`; }

async function create(token, suffix, body, label) {
  const response = await request(adminUrl(suffix), { method: 'POST', token, body });
  if (response.status !== 201 && response.status !== 204) throw safeError(label, response);
  return response.headers.get('location');
}

function idFromLocation(location, label) {
  if (!location) throw new Error(`${label}: Keycloak tidak mengembalikan Location.`);
  return new URL(location, base).pathname.split('/').filter(Boolean).at(-1);
}

function mappers(kind) {
  return [
    {
      name: 'subject',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-sub-mapper',
      consentRequired: false,
      config: {
        'access.token.claim': 'true',
        'id.token.claim': 'true',
        'introspection.token.claim': 'true',
      },
    },
    {
      name: 'titipin-audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
      consentRequired: false,
      config: {
        'included.custom.audience': audience,
        'access.token.claim': 'true', 'id.token.claim': 'false', 'introspection.token.claim': 'true',
      },
    },
    {
      name: 'caller-kind', protocol: 'openid-connect', protocolMapper: 'oidc-hardcoded-claim-mapper',
      consentRequired: false,
      config: {
        'claim.name': 'caller_kind', 'claim.value': kind, 'jsonType.label': 'String',
        'access.token.claim': 'true', 'id.token.claim': 'false', 'introspection.token.claim': 'true',
      },
    },
    {
      name: 'realm-roles', protocol: 'openid-connect', protocolMapper: 'oidc-usermodel-realm-role-mapper',
      consentRequired: false,
      config: {
        'claim.name': 'realm_access.roles', 'jsonType.label': 'String', 'multivalued': 'true',
        'access.token.claim': 'true', 'id.token.claim': 'false', 'introspection.token.claim': 'true',
        'usermodel.realmRoleMapping.rolePrefix': '',
      },
    },
  ];
}

async function getRealmRole(token, name) {
  return readJson(await request(adminUrl(`/roles/${encodeURIComponent(name)}`), { token }), `Membaca role ${name}`);
}

async function createClient(token, config) {
  const location = await create(token, '/clients', config, `Membuat client ${config.clientId}`);
  return idFromLocation(location, `Client ${config.clientId}`);
}

async function assignRealmRole(token, userId, role) {
  await create(token, `/users/${encodeURIComponent(userId)}/role-mappings/realm`, [role], `Memberi role ${role.name}`);
}

async function main() {
  if (!fs.existsSync(envFile)) throw new Error('Buat .local/auth.env dahulu dengan node infra/init-auth.cjs.');
  if (fs.existsSync(credentialsFile)) throw new Error('.local/auth-credentials.json sudah ada; script tidak menimpa user password atau secret.');

  const env = readEnv(envFile);
  if (!env.KC_BOOTSTRAP_ADMIN_USERNAME || !env.KC_BOOTSTRAP_ADMIN_PASSWORD) {
    throw new Error('.local/auth.env tidak lengkap.');
  }
  const token = await waitForAdmin(env);
  const existing = await request(`${base}/admin/realms/${realm}`, { token });
  if (existing.status === 200) throw new Error(`Realm ${realm} sudah ada. Jangan jalankan seed ulang pada realm aktif.`);
  if (existing.status !== 404) throw safeError('Memeriksa realm', existing);

  const realmResponse = await request(`${base}/admin/realms`, {
    method: 'POST', token,
    body: {
      realm, displayName: 'Titipin', enabled: true, registrationAllowed: false,
      resetPasswordAllowed: false, defaultSignatureAlgorithm: 'RS256', accessTokenLifespan: 300,
      ssoSessionIdleTimeout: 1800, ssoSessionMaxLifespan: 36000,
      revokeRefreshToken: true, refreshTokenMaxReuse: 0,
    },
  });
  if (realmResponse.status !== 201) throw safeError('Membuat realm titipin', realmResponse);

  for (const name of ['requester', 'jastiper', 'admin', 'mcp-reader']) {
    await create(token, '/roles', { name, description: `Titipin ${name}` }, `Membuat role ${name}`);
  }
  const roles = Object.fromEntries(await Promise.all(
    ['requester', 'jastiper', 'admin', 'mcp-reader'].map(async (name) => [name, await getRealmRole(token, name)])
  ));

  const scopeIds = {};
  for (const [name, scope] of Object.entries(scopes)) {
    const location = await create(token, '/client-scopes', {
      name, description: scope.description, protocol: 'openid-connect',
      attributes: { 'include.in.token.scope': 'true', 'display.on.consent.screen': 'false' },
    }, `Membuat scope ${name}`);
    scopeIds[name] = idFromLocation(location, `Scope ${name}`);
    await create(token, `/client-scopes/${encodeURIComponent(scopeIds[name])}/scope-mappings/realm`,
      scope.roles.map((role) => roles[role]), `Membatasi scope ${name}`);
  }

  await createClient(token, {
    clientId: audience, name: 'Titipin Resource Server', enabled: true, protocol: 'openid-connect',
    publicClient: true, standardFlowEnabled: false, implicitFlowEnabled: false,
    directAccessGrantsEnabled: false, serviceAccountsEnabled: false, fullScopeAllowed: false,
  });

  const userClient = (clientId, kind, optionalClientScopes, extra = {}) => ({
    clientId, name: clientId, enabled: true, protocol: 'openid-connect', publicClient: true,
    standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false, fullScopeAllowed: false, optionalClientScopes,
    protocolMappers: mappers(kind), ...extra,
  });
  await createClient(token, userClient('titipin-web', 'user',
    ['requests:read', 'payments:read', 'accounts:read', 'issues:read', 'issues:write'], {
      redirectUris: ['http://localhost:5173/callback'], webOrigins: ['http://localhost:5173'],
      attributes: { 'pkce.code.challenge.method': 'S256' },
    }));
  await createClient(token, userClient('titipin-mobile', 'user',
    ['requests:read', 'requests:write', 'requests:fulfil', 'deliveries:write', 'payments:read', 'accounts:read', 'issues:write'], {
      redirectUris: ['titipin://oauth/callback'], attributes: { 'pkce.code.challenge.method': 'S256' },
    }));
  await createClient(token, userClient('titipin-tracker', 'tracker', ['deliveries:write'], {
    redirectUris: ['http://127.0.0.1:5174/callback'], webOrigins: ['http://127.0.0.1:5174'],
    attributes: { 'pkce.code.challenge.method': 'S256' },
  }));
  await createClient(token, userClient('titipin-partner', 'user', ['requests:read'], {
    enabled: false, standardFlowEnabled: false, redirectUris: [],
  }));
  const mcpId = await createClient(token, {
    clientId: 'titipin-mcp', name: 'titipin-mcp', enabled: true, protocol: 'openid-connect',
    publicClient: false, clientAuthenticatorType: 'client-secret', standardFlowEnabled: false,
    implicitFlowEnabled: false, directAccessGrantsEnabled: false, serviceAccountsEnabled: true,
    fullScopeAllowed: false, optionalClientScopes: ['requests:read', 'issues:read'], protocolMappers: mappers('service'),
  });
  await createClient(token, {
    clientId: 'test-cli', name: 'test-cli', enabled: true, protocol: 'openid-connect', publicClient: true,
    standardFlowEnabled: false, implicitFlowEnabled: false, directAccessGrantsEnabled: true,
    serviceAccountsEnabled: false, fullScopeAllowed: false, optionalClientScopes: allScopes, protocolMappers: mappers('user'),
  });

  const serviceAccount = await readJson(await request(adminUrl(`/clients/${encodeURIComponent(mcpId)}/service-account-user`), { token }), 'Membaca service account MCP');
  await assignRealmRole(token, serviceAccount.id, roles['mcp-reader']);
  const secret = await readJson(await request(adminUrl(`/clients/${encodeURIComponent(mcpId)}/client-secret`), { token }), 'Membaca secret MCP');

  const createdUsers = [];
  for (const [username, roleName] of users) {
        const password = randomBytes(24).toString('base64url');
    const profile = {
      firstName: roleName === 'jastiper'
        ? 'Jastiper'
        : roleName[0].toUpperCase() + roleName.slice(1),
      lastName: username.endsWith('-a') ? 'A' : 'B',
      email: `${username}@example.com`,
    };

    const location = await create(token, '/users', {
      username,
      ...profile,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{ type: 'password', value: password, temporary: false }],
      realmRoles: [roleName],
    }, `Membuat user ${username}`);
    const id = idFromLocation(location, `User ${username}`);
    await assignRealmRole(token, id, roles[roleName]);
    createdUsers.push({ username, password, role: roleName, subject: id });
  }

  fs.writeFileSync(credentialsFile, JSON.stringify({ issuer, audience, users: createdUsers,
    mcp: { clientId: 'titipin-mcp', clientSecret: secret.value } }, null, 2) + '\n',
  { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log('Realm Titipin, client, scope, service account, dan enam user uji sudah dibuat.');
  console.log('Kredensial lokal disimpan di .local/auth-credentials.json dan tidak dicetak.');
}

main().catch((error) => {
  console.error('FAIL Step 3 setup: ' + error.message);
  process.exitCode = 1;
});
