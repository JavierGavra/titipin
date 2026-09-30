function validateRequestId(requestId) {
  const isString = typeof requestId === 'string'
  const length = isString ? Array.from(requestId).length : 0

  if (!isString || length < 8 || length > 64) {
    return [
      {
        name: 'requestId',
        location: 'path',
        reason: 'requestId must be a string containing 8 to 64 characters.',
      },
    ]
  }

  return []
}

function validateRequestQuery(query) {
  const invalidParameters = [];

  function addError(name, reason) {
    invalidParameters.push({
      name,
      location: 'query',
      reason,
    });
  }

  let limit = 20;

  if (query.limit !== undefined) {
    const value = typeof query.limit === 'string'
      && query.limit.trim() !== ''
      ? Number(query.limit)
      : NaN;

    if (!Number.isInteger(value) || value < 1 || value > 100) {
      addError('limit', 'limit must be an integer between 1 and 100.');
    } else {
      limit = value;
    }
  }

  const allowedStatuses = [
    'open',
    'assigned',
    'completed',
    'expired',
    'cancelled',
    'unavailable',
  ];

  let status = null;

  if (query.status !== undefined) {
    if (!allowedStatuses.includes(query.status)) {
      addError('status', 'status must be a documented request status.');
    } else {
      status = query.status;
    }
  }

  let offset = 0;

  if (query.cursor !== undefined) {
    const cursor = query.cursor;

    if (typeof cursor !== 'string'
        || Array.from(cursor).length > 512) {
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
const CURRENCIES = new Set(['IDR']);

function validateCreateRequestBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return [{
      name: 'body',
      location: 'body',
      reason: 'The request body must be a JSON object.',
    }];
  }

  const errors = [];

  function addError(name, reason) {
    errors.push({ name, location: 'body', reason });
  }

  const itemDescLen = typeof body.itemDescription === 'string'
    ? Array.from(body.itemDescription).length
    : -1;
  if (itemDescLen < 1 || itemDescLen > 500) {
    addError('itemDescription', 'itemDescription is required and must be a string of 1 to 500 characters.');
  }

  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 99) {
    addError('quantity', 'quantity is required and must be an integer between 1 and 99.');
  }

  const storeLen = typeof body.targetStoreOrArea === 'string'
    ? Array.from(body.targetStoreOrArea).length
    : -1;
  if (storeLen < 1 || storeLen > 300) {
    addError('targetStoreOrArea', 'targetStoreOrArea is required and must be a string of 1 to 300 characters.');
  }

  if (body.budget === null || typeof body.budget !== 'object' || Array.isArray(body.budget)) {
    addError('budget', 'budget is required and must be an object.');
  } else {
    if (!Number.isInteger(body.budget.amount) || body.budget.amount < 0) {
      addError('budget.amount', 'budget.amount must be a non-negative integer.');
    }
    if (!CURRENCIES.has(body.budget.currency)) {
      addError('budget.currency', 'budget.currency must be IDR.');
    }
  }

  const addrLen = typeof body.deliveryAddress === 'string'
    ? Array.from(body.deliveryAddress).length
    : -1;
  if (addrLen < 1 || addrLen > 500) {
    addError('deliveryAddress', 'deliveryAddress is required and must be a string of 1 to 500 characters.');
  }

  const datetimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  if (typeof body.deadline !== 'string' || !datetimePattern.test(body.deadline)
      || !Number.isFinite(Date.parse(body.deadline))) {
    addError('deadline', 'deadline is required and must be an RFC 3339 timestamp with timezone offset.');
  } else if (Date.parse(body.deadline) <= Date.now()) {
    addError('deadline', 'deadline must be in the future.');
  }

  return errors;
}

module.exports = {
  validateRequestId,
  validateRequestQuery,
  validateCreateRequestBody,
};