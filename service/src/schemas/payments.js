'use strict';

const ALLOWED_METHODS = new Set(['simulated_card', 'simulated_bank_transfer']);

function validatePaymentId(paymentId) {
  const length = typeof paymentId === 'string' ? Array.from(paymentId).length : 0;

  return length >= 8 && length <= 64 ? [] : [{
    name: 'paymentId',
    location: 'path',
    reason: 'paymentId must be a string containing 8 to 64 characters.',
  }];
}

function validateCreatePaymentBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return [{
      name: 'body',
      location: 'body',
      reason: 'The request body must be a JSON object.',
    }];
  }

  if (!Object.hasOwn(body, 'method') || !ALLOWED_METHODS.has(body.method)) {
    return [{
      name: 'method',
      location: 'body',
      reason: 'method is required and must be simulated_card or simulated_bank_transfer.',
    }];
  }

  return [];
}

module.exports = {
  validatePaymentId,
  validateCreatePaymentBody,
};
