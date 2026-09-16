'use strict';

const { unauthorized, forbidden } = require('../problem');

function requireScope(...needed) {
  return function checkScope(req, res, next) {
    if (!req.principal) return unauthorized(res);
    if (!needed.every((scope) => req.principal.scopes.includes(scope))) { // mutation: scope
      return forbidden(res, needed);
    }
    return next();
  };
}

module.exports = { requireScope };
