'use strict';

const ALLOWED_CATEGORIES = new Set(['payment', 'availability', 'delivery', 'receipt', 'other']);
const ALLOWED_OUTCOMES = new Set(['delivery_restarted', 'payment_refunded', 'request_cancelled', 'no_action']);
const ALLOWED_STATUSES = ['open', 'in_review', 'resolved'];

function validateIssueId(value) {
  return typeof value === 'string' && Array.from(value).length >= 8
    && Array.from(value).length <= 64 && !value.includes('\u0000') ? [] : [{
      name: 'issueId', location: 'path', reason: 'issueId must contain 8 to 64 valid characters.',
    }];
}

function validateIssueQuery(query) {
  const invalidParameters = [];

  function addError(name, reason) {
    invalidParameters.push({ name, location: 'query', reason });
  }

  let limit = 10;

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
      addError('status', 'status must be open, in_review, or resolved.');
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
    value: { limit, offset, status },
  };
}

function validateCreateIssueBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [{ name: 'body', location: 'body', reason: 'The request body must be a JSON object.' }];
  }

  const errors = [];

  for (const field of ['requestId', 'assignmentId', 'paymentId']) {
    const len = typeof body[field] === 'string' ? Array.from(body[field]).length : -1;
    if (len < 8 || len > 64) {
      errors.push({
        name: field,
        location: 'body',
        reason: `${field} is required and must be a string between 8 and 64 characters.`,
      });
    }
  }

  // deliveryId è nullable
  if (body.deliveryId !== undefined && body.deliveryId !== null) {
    const len = typeof body.deliveryId === 'string' ? Array.from(body.deliveryId).length : -1;
    if (len < 8 || len > 64) {
      errors.push({
        name: 'deliveryId',
        location: 'body',
        reason: 'deliveryId must be null or a string between 8 and 64 characters.',
      });
    }
  }

  if (!ALLOWED_CATEGORIES.has(body.category)) {
    errors.push({
      name: 'category',
      location: 'body',
      reason: 'category is required and must be one of: payment, availability, delivery, receipt, other.',
    });
  }

  const descLen = typeof body.description === 'string' ? Array.from(body.description).length : -1;
  if (descLen < 1 || descLen > 1000) {
    errors.push({
      name: 'description',
      location: 'body',
      reason: 'description is required and must be a string between 1 and 1000 characters.',
    });
  }

  return errors;
}

function validateIssueResolutionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return [{ name: 'body', location: 'body', reason: 'The request body must be a JSON object.' }];
  }

  const errors = [];

  if (!ALLOWED_OUTCOMES.has(body.outcome)) {
    errors.push({
      name: 'outcome',
      location: 'body',
      reason: 'outcome is required and must be one of: delivery_restarted, payment_refunded, request_cancelled, no_action.',
    });
  }

  const noteLen = typeof body.note === 'string' ? Array.from(body.note).length : -1;
  if (noteLen < 1 || noteLen > 1000) {
    errors.push({
      name: 'note',
      location: 'body',
      reason: 'note is required and must be a string between 1 and 1000 characters.',
    });
  }

  const datetime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
  const dateParts = typeof body.resolvedAt === 'string'
    && /^(\d{4})-(\d{2})-(\d{2})T/i.exec(body.resolvedAt);
  const validDay = dateParts
    && Number(dateParts[2]) >= 1 && Number(dateParts[2]) <= 12
    && Number(dateParts[3]) >= 1
    && Number(dateParts[3]) <= new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]), 0)).getUTCDate();

  if (typeof body.resolvedAt !== 'string' || !datetime.test(body.resolvedAt)
      || !validDay || !Number.isFinite(Date.parse(body.resolvedAt))) {
    errors.push({
      name: 'resolvedAt',
      location: 'body',
      reason: 'resolvedAt is required and must be an RFC 3339 timestamp with timezone offset.',
    });
  }

  return errors;
}

module.exports = {
  validateIssueId,
  validateIssueQuery,
  validateCreateIssueBody,
  validateIssueResolutionBody,
};
