'use strict';

// Checkpoint Step 3. Verifikasi di sini tidak menggantikan middleware API Step 6.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createPublicKey, verify } = require('node:crypto');

const expectedScopes = {
  requester: ['requests:read', 'requests:write', 'payments:read', 'accounts:read', 'issues:write'],
  jastiper: ['requests:read', 'requests:fulfil', 'deliveries:write', 'payments:read', 'accounts:read', 'issues:write'],
  admin: ['requests:read', 'payments:read', 'accounts:read', 'issues:read', 'issues:write'],
  'mcp-reader': ['requests:read', 'issues:read'],
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Authorization server menjawab HTTP ${response.status}.`);
  return response.json();
}

function verifyForCheckpoint(raw, jwks, expected) {
  assert.equal(typeof raw, 'string', 'Access token tidak diterima.');
  const parts = raw.split('.');
  assert.equal(parts.length, 3, 'Bentuk JWT tidak sesuai.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  assert.equal(header.alg, 'RS256', 'Algorithm harus RS256.');
  const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  assert.ok(jwk, 'Signing key tidak ditemukan pada JWKS.');
  assert.ok(verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url')),
  'Signature tidak valid.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert.equal(claims.iss, expected.issuer, 'Issuer berbeda.');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  assert.ok(audiences.includes(expected.audience), 'Audience API tidak ditemukan.');
  assert.ok(typeof claims.sub === 'string' && claims.sub.length > 0, 'Subject kosong.');
  assert.ok(Number.isFinite(claims.exp) && claims.exp > Date.now() / 1000, 'Token kedaluwarsa.');
  assert.equal(claims.azp, expected.clientId, 'Client penerima token berbeda.');
  assert.equal(claims.caller_kind, expected.kind, 'Claim caller_kind belum sesuai.');
  if (expected.subject) assert.equal(claims.sub, expected.subject, 'Subject bukan user yang diminta.');
  const businessScopes = String(claims.scope || '').split(/\s+/).filter((scope) => scope.includes(':')).sort();
  assert.deepEqual(businessScopes, [...expected.scopes].sort(), 'Scope kurang atau terjadi pemberian izin berlebihan.');
  return { iss: claims.iss, aud: claims.aud, sub: claims.sub, exp: claims.exp, scope: claims.scope, caller_kind: claims.caller_kind };
}

async function main() {
  const credentials = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.local/auth-credentials.json'), 'utf8'));
  const discovery = await fetchJson(`${credentials.issuer}/.well-known/openid-configuration`);
  assert.equal(discovery.issuer, credentials.issuer, 'Discovery issuer berbeda.');
  const jwks = await fetchJson(discovery.jwks_uri);
  const tokenRequest = (fields) => fetchJson(discovery.token_endpoint, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields),
  });

  console.log(JSON.stringify({ issuer: discovery.issuer, jwks_uri: discovery.jwks_uri, audience: credentials.audience }, null, 2));
  const requested = Object.values(expectedScopes).flat().filter((value, index, array) => array.indexOf(value) === index).join(' ');
  for (const user of credentials.users) {
    const tokens = await tokenRequest({ grant_type: 'password', client_id: 'test-cli', username: user.username, password: user.password, scope: requested });
    const claims = verifyForCheckpoint(tokens.access_token, jwks, {
      issuer: credentials.issuer, audience: credentials.audience, clientId: 'test-cli', kind: 'user', subject: user.subject,
      scopes: expectedScopes[user.role],
    });
    console.log(JSON.stringify({ user: user.username, result: 'PASS', claims }));
  }
  const tokens = await tokenRequest({ grant_type: 'client_credentials', client_id: credentials.mcp.clientId,
    client_secret: credentials.mcp.clientSecret, scope: expectedScopes['mcp-reader'].join(' ') });
  const claims = verifyForCheckpoint(tokens.access_token, jwks, {
    issuer: credentials.issuer, audience: credentials.audience, clientId: credentials.mcp.clientId, kind: 'service',
    scopes: expectedScopes['mcp-reader'],
  });
  console.log(JSON.stringify({ client: credentials.mcp.clientId, result: 'PASS', claims }));
  console.log('PASS Step 3: enam user + satu service account; signature, iss, aud, exp, sub, dan pembatasan scope sesuai.');
}

main().catch((error) => {
  console.error('FAIL Step 3: ' + error.message);
  process.exitCode = 1;
});

module.exports = { verifyForCheckpoint };
