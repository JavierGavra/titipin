'use strict';

function validateDeliveryId(value) {
  return typeof value === 'string' && Array.from(value).length >= 8
    && Array.from(value).length <= 64 && !value.includes('\u0000') ? [] : [{
      name: 'deliveryId', location: 'path', reason: 'deliveryId must contain 8 to 64 valid characters.',
    }];
}

function validateLocationBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [{ name: 'body', location: 'body', reason: 'The request body must be a JSON object.' }];
  }
  const errors = [];
  for (const [name, max] of [['latitude', 90], ['longitude', 180]]) {
    if (typeof body[name] !== 'number' || !Number.isFinite(body[name]) || Math.abs(body[name]) > max) {
      errors.push({ name, location: 'body', reason: `${name} must be between -${max} and ${max}.` });
    }
  }
  const datetime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  const dateParts = typeof body.recordedAt === 'string' && /^(\d{4})-(\d{2})-(\d{2})T/i.exec(body.recordedAt);
  const validDay = dateParts && Number(dateParts[2]) >= 1 && Number(dateParts[2]) <= 12
    && Number(dateParts[3]) >= 1
    && Number(dateParts[3]) <= new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]), 0)).getUTCDate();
  if (typeof body.recordedAt !== 'string' || !datetime.test(body.recordedAt)
      || !validDay || !Number.isFinite(Date.parse(body.recordedAt))) {
    errors.push({ name: 'recordedAt', location: 'body', reason: 'recordedAt must be an RFC 3339 timestamp with timezone.' });
  }
  return errors;
}

function validateCreateDeliveryBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [{ name: 'body', location: 'body', reason: 'The request body must be a JSON object.' }];
  }

  const errors = [];
  const datetime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  const dateParts = typeof body.purchaseRecordedAt === 'string'
    && /^(\d{4})-(\d{2})-(\d{2})T/i.exec(body.purchaseRecordedAt);
  const validDay = dateParts
    && Number(dateParts[2]) >= 1 && Number(dateParts[2]) <= 12
    && Number(dateParts[3]) >= 1
    && Number(dateParts[3]) <= new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]), 0)).getUTCDate();

  if (typeof body.purchaseRecordedAt !== 'string' || !datetime.test(body.purchaseRecordedAt)
      || !validDay || !Number.isFinite(Date.parse(body.purchaseRecordedAt))) {
    errors.push({
      name: 'purchaseRecordedAt',
      location: 'body',
      reason: 'purchaseRecordedAt is required and must be an RFC 3339 timestamp with timezone offset.',
    });
  }

  return errors;
}

function validateLocationQuery(query) {
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
    value: { limit, offset },
  };
}

function validateConfirmationId(value) {
  return typeof value === 'string' && Array.from(value).length >= 8
    && Array.from(value).length <= 64 && !value.includes('\u0000') ? [] : [{
      name: 'confirmationId', location: 'path', reason: 'confirmationId must contain 8 to 64 valid characters.',
    }];
}

function validateReceiptConfirmationBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [{ name: 'body', location: 'body', reason: 'The request body must be a JSON object.' }];
  }

  const errors = [];
  const datetime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  const dateParts = typeof body.confirmedAt === 'string'
    && /^(\d{4})-(\d{2})-(\d{2})T/i.exec(body.confirmedAt);
  const validDay = dateParts
    && Number(dateParts[2]) >= 1 && Number(dateParts[2]) <= 12
    && Number(dateParts[3]) >= 1
    && Number(dateParts[3]) <= new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]), 0)).getUTCDate();

  if (typeof body.confirmedAt !== 'string' || !datetime.test(body.confirmedAt)
      || !validDay || !Number.isFinite(Date.parse(body.confirmedAt))) {
    errors.push({
      name: 'confirmedAt',
      location: 'body',
      reason: 'confirmedAt is required and must be an RFC 3339 timestamp with timezone offset.',
    });
  }

  const nameLen = typeof body.recipientName === 'string'
    ? Array.from(body.recipientName).length
    : -1;

  if (nameLen < 1 || nameLen > 200) {
    errors.push({
      name: 'recipientName',
      location: 'body',
      reason: 'recipientName is required and must be a string between 1 and 200 characters.',
    });
  }

  if (body.note !== undefined && body.note !== null) {
    const noteLen = typeof body.note === 'string' ? Array.from(body.note).length : -1;
    if (noteLen < 0 || noteLen > 500) {
      errors.push({
        name: 'note',
        location: 'body',
        reason: 'note must be a string of at most 500 characters.',
      });
    }
  }

  return errors;
}

module.exports = {
  validateDeliveryId, validateLocationBody, validateCreateDeliveryBody,
  validateLocationQuery, validateConfirmationId, validateReceiptConfirmationBody,
};
