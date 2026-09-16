'use strict';

const { verifyAccessToken } = require('./verify');
const { principalFrom } = require('./principal');
const { unauthorized } = require('../problem');

async function authenticate(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  // Query-string credentials are never an authentication mechanism.
  if (Object.keys(req.query).some((key) => /^(access_token|refresh_token|id_token|token)$/i.test(key))) {
    return unauthorized(res);
  }
  const header = req.get('authorization') || '';
  const match = /^Bearer ([^\s,]+)$/i.exec(header);
  if (!match || match[1].length > 16384) return unauthorized(res);
  try {
    req.principal = principalFrom(await verifyAccessToken(match[1]));
  } catch {
    // Never log a token, provider error payload, request, or exception message.
    req.log?.warn({ reason: 'invalid_token', correlationId: req.correlationId }, 'token rejected');
    return unauthorized(res);
  }
  return next();
}

module.exports = { authenticate };
