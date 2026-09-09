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
module.exports = {
  validateRequestId,
  validateRequestQuery,
};