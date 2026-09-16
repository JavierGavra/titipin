'use strict';

const { createRemoteJWKSet, jwtVerify } = require('jose');
const { loadConfig } = require('../config');

// One resolver per process; jose caches keys and handles key rotation.
let jwks;
let oidc;

async function verifyAccessToken(raw) {
  if (!jwks) {
    oidc = loadConfig().oidc;
    jwks = createRemoteJWKSet(new URL(oidc.jwksUri), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000,
    });
  }
  const { payload } = await jwtVerify(raw, jwks, {
    issuer: oidc.issuer,
    audience: oidc.audience,
    algorithms: ['RS256'],
    requiredClaims: ['iss', 'aud', 'exp', 'sub'],
    clockTolerance: 5,
  });
  if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
    throw new Error('Invalid subject');
  }
  return payload;
}

module.exports = { verifyAccessToken };
