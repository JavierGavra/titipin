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

module.exports = { validateDeliveryId, validateLocationBody };
