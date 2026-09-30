'use strict';

const { createServer } = require('node:http');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');

async function createTokens() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${server.address().port}`;
  return {
    issuer, jwksUri: issuer + '/jwks', audience: 'titipin-test-api',
    async sign(subject, scopes, { role = 'requester', kind = 'user', clientId = 'test-cli', ...claims } = {}) {
      return new SignJWT({
        scope: scopes.join(' '), caller_kind: kind, azp: clientId,
        realm_access: { roles: [role] }, iss: issuer, aud: 'titipin-test-api', sub: subject,
        exp: Math.floor(Date.now() / 1000) + 300, ...claims,
      }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuedAt().sign(privateKey);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { createTokens };
