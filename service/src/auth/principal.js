'use strict';

// caller_kind is the explicit Step 3 Keycloak mapper, not a guess from sub/azp.
function principalFrom(claims) {
  if (!['user', 'service', 'tracker'].includes(claims.caller_kind)
      || typeof claims.azp !== 'string' || !claims.azp
      || (claims.scope !== undefined && typeof claims.scope !== 'string')) {
    throw new Error('Invalid principal claims');
  }
  if ((claims.caller_kind === 'tracker' && claims.azp !== 'titipin-tracker')
      || (claims.caller_kind === 'service' && claims.azp !== 'titipin-mcp')) {
    throw new Error('Invalid client kind');
  }
  const roles = claims.realm_access?.roles;
  return Object.freeze({
    subject: claims.sub,
    issuer: claims.iss,
    clientId: claims.azp,
    kind: claims.caller_kind,
    scopes: Object.freeze([...new Set((claims.scope || '').split(/\s+/).filter(Boolean))]),
    roles: Object.freeze(Array.isArray(roles) ? roles.filter((r) => typeof r === 'string') : []),
  });
}

module.exports = { principalFrom };
