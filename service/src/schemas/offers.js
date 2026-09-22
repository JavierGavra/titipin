'use strict';

const CURRENCIES = new Set(['IDR']);
const ALLOWED_STATUSES = ['active', 'selected', 'withdrawn', 'expired'];
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function validateOfferId(offerId) {
  const length = typeof offerId === 'string' ? Array.from(offerId).length : 0;

  return length >= 8 && length <= 64 ? [] : [{
    name: 'offerId',
    location: 'path',
    reason: 'offerId must be a string containing 8 to 64 characters.',
  }];
}

function validateOfferQuery(query) {
  const invalidParameters = [];

  function addError(name, reason) {
    invalidParameters.push({ name, location: 'query', reason });
  }

  let limit = 20;

  if (query.limit !== undefined) {
    const value = typeof query.limit === 'string' && query.limit.trim() !== ''
      ? Number(query.limit)
      : NaN;

    if (!Number.isInteger(value) || value < 1 || value > 100) {
      addError('limit', 'limit must be an integer between 1 and 100.');
    } else {
      limit = value;
    }
  }

  let status = null;

  if (query.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(query.status)) {
      addError('status', 'status must be a documented offer status.');
    } else {
      status = query.status;
    }
  }

  let offset = 0;

  if (query.cursor !== undefined) {
    const cursor = query.cursor;

    if (typeof cursor !== 'string' || Array.from(cursor).length > 512) {
      addError('cursor', 'cursor must be a string of at most 512 characters.');
    } else if (cursor !== '') {
      try {
        const decoded = Buffer.from(cursor, 'base64url');

        if (decoded.toString('base64url') !== cursor) {
          throw new Error('Invalid cursor encoding.');
        }

        const value = JSON.parse(decoded.toString('utf8'));

        if (value === null
            || typeof value !== 'object'
            || Array.isArray(value)
            || !Number.isSafeInteger(value.offset)
            || value.offset < 0) {
          throw new Error('Invalid cursor value.');
        }

        offset = value.offset;
      } catch {
        addError('cursor', 'Use a valid cursor returned by the previous page.');
      }
    }
  }

  return {
    invalidParameters,
    value: { limit, status, offset },
  };
}

function validateMoney(name, value, errors) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push({ name, location: 'body', reason: `${name} is required and must be an object.` });
    return;
  }

  if (!Number.isInteger(value.amount) || value.amount < 0) {
    errors.push({ name: `${name}.amount`, location: 'body', reason: `${name}.amount must be a non-negative integer.` });
  }

  if (!CURRENCIES.has(value.currency)) {
    errors.push({ name: `${name}.currency`, location: 'body', reason: `${name}.currency must be IDR.` });
  }
}

function validateDatetime(name, value, errors) {
  if (typeof value !== 'string' || !DATETIME_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    errors.push({ name, location: 'body', reason: `${name} must be an RFC 3339 timestamp with timezone offset.` });
  }
}

function validateCreateOfferBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return [{
      name: 'body',
      location: 'body',
      reason: 'The request body must be a JSON object.',
    }];
  }

  const errors = [];

  validateMoney('itemPrice', body.itemPrice, errors);
  validateMoney('serviceFee', body.serviceFee, errors);
  validateMoney('deliveryFee', body.deliveryFee, errors);

  validateDatetime('estimatedArrivalAt', body.estimatedArrivalAt, errors);
  validateDatetime('stockCheckedAt', body.stockCheckedAt, errors);
  validateDatetime('expiresAt', body.expiresAt, errors);

  if (body.note !== undefined && body.note !== null) {
    const noteLen = typeof body.note === 'string' ? Array.from(body.note).length : -1;
    if (noteLen < 0 || noteLen > 500) {
      errors.push({ name: 'note', location: 'body', reason: 'note must be a string of at most 500 characters.' });
    }
  }

  return errors;
}

module.exports = {
  validateOfferId,
  validateOfferQuery,
  validateCreateOfferBody,
};
