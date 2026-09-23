'use strict';

function validateAccountId(value) {
  return typeof value === 'string' && Array.from(value).length >= 8
    && Array.from(value).length <= 64 && !value.includes('\u0000') ? [] : [{
      name: 'accountId', location: 'path', reason: 'accountId must contain 8 to 64 valid characters.',
    }];
}

module.exports = { validateAccountId };
