function validateAssignmentId(assignmentId) {
  const length = typeof assignmentId === 'string'
    ? Array.from(assignmentId).length
    : 0;

  return length >= 8 && length <= 64 ? [] : [{
    name: 'assignmentId',
    location: 'path',
    reason: 'assignmentId must be a string containing 8 to 64 characters.',
  }];
}

function validateSelectOfferBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return [{
      name: 'body',
      location: 'body',
      reason: 'The request body must be a JSON object.',
    }];
  }

  if (!Object.hasOwn(body, 'offerId') || typeof body.offerId !== 'string') {
    return [{
      name: 'offerId',
      location: 'body',
      reason: 'offerId is required and must be a string.',
    }];
  }

  return [];
}

function validateIdempotencyKey(key) {
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return typeof key === 'string' && uuidV4.test(key) ? [] : [{
    name: 'Idempotency-Key',
    location: 'header',
    reason: 'Idempotency-Key must be a canonical UUID version 4.',
  }];
}

module.exports = {
  validateAssignmentId,
  validateSelectOfferBody,
  validateIdempotencyKey,
};