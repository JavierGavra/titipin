'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayWriteLocation, mayReadDelivery, mayCreateReceiptConfirmation } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { getDeliveryById, appendLocation, listLocationUpdates } = require('../store/deliveries');
const { runIdempotent } = require('../store/idempotency');
const { validateIdempotencyKey } = require('../schemas/assignments');
const { validateDeliveryId, validateLocationBody, validateLocationQuery, validateReceiptConfirmationBody } = require('../schemas/deliveries');
const { toLocation, toDelivery, toLocationPage } = require('../representations/deliveries');
const { toReceiptConfirmation } = require('../representations/receipt-confirmations');
const { createReceiptConfirmation } = require('../store/receipt-confirmations');
const { sendProblem, ProblemError } = require('../problem');

const router = express.Router();

router.get('/:deliveryId', requireScope('requests:read'), async (req, res) => {
  const invalidParameters = validateDeliveryId(req.params.deliveryId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The deliveryId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const row = await getDeliveryById(req.params.deliveryId, actor);

  if (!mayReadDelivery(actor, row)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested delivery was not found.',
    });
  }

  return res.status(200).json(toDelivery(row));
});

router.get('/:deliveryId/locations', requireScope('requests:read'), async (req, res) => {
  const invalidId = validateDeliveryId(req.params.deliveryId);

  if (invalidId.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The deliveryId path parameter is invalid.',
      extensions: { invalidParameters: invalidId },
    });
  }

  const { invalidParameters, value } = validateLocationQuery(req.query);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'One or more query parameters are invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const delivery = await getDeliveryById(req.params.deliveryId, actor);

  if (!mayReadDelivery(actor, delivery)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested delivery was not found.',
    });
  }

  const rows = await listLocationUpdates(req.params.deliveryId, value);

  return res.status(200).json(toLocationPage(rows, value));
});

router.post('/:deliveryId/locations', requireScope('deliveries:write'), express.json(), async (req, res) => {
  const invalidId = validateDeliveryId(req.params.deliveryId);
  if (invalidId.length) return sendProblem(res, 'invalid-request', { extensions: { invalidParameters: invalidId } });
  const key = req.get('Idempotency-Key');
  if (validateIdempotencyKey(key).length) return sendProblem(res, 'invalid-idempotency-key');
  if (!req.is('application/json')) return sendProblem(res, 'invalid-request');
  const invalidBody = validateLocationBody(req.body);
  if (invalidBody.length) return sendProblem(res, 'validation-failed', { extensions: { invalidParameters: invalidBody } });

  let delivery;
  const response = await runIdempotent({
    principal: req.principal, key, method: req.method, uri: req.originalUrl, body: req.body,
    authorize: async (client, lock) => {
      const actor = await resolveActor(req.principal, client);
      delivery = await getDeliveryById(req.params.deliveryId, actor, client, lock);
      if (!mayWriteLocation(actor, delivery)) { // mutation: delivery-owner
        throw new ProblemError('resource-not-found');
      }
    },
    execute: async (client) => {
      const row = await appendLocation(client, delivery, req.body);
      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: `/v1/deliveries/${encodeURIComponent(row.delivery_id)}/locations/${encodeURIComponent(row.location_id)}`,
        },
        body: JSON.stringify(toLocation(row)),
      };
    },
  });
  return res.status(response.status).set(response.headers).send(response.body);
});

router.post('/:deliveryId/receipt-confirmations', requireScope('requests:write'), express.json(), async (req, res) => {
  const invalidId = validateDeliveryId(req.params.deliveryId);

  if (invalidId.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The deliveryId path parameter is invalid.',
      extensions: { invalidParameters: invalidId },
    });
  }

  const key = req.get('Idempotency-Key');
  const invalidKey = validateIdempotencyKey(key);

  if (invalidKey.length) {
    return sendProblem(res, 'invalid-idempotency-key', {
      extensions: {
        headerName: 'Idempotency-Key',
        invalidParameters: invalidKey,
      },
    });
  }

  if (!req.is('application/json')) {
    return sendProblem(res, 'invalid-request', {
      detail: 'Content-Type must be application/json.',
      extensions: {
        invalidParameters: [{
          name: 'Content-Type',
          location: 'header',
          reason: 'Send a JSON body with Content-Type: application/json.',
        }],
      },
    });
  }

  const invalidBody = validateReceiptConfirmationBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match CreateReceiptConfirmation.',
      extensions: { invalidParameters: invalidBody },
    });
  }

  let actor;
  let deliveryRow;
  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client) => {
      actor = await resolveActor(req.principal, client);
      deliveryRow = await getDeliveryById(req.params.deliveryId, actor, client);
      if (!mayCreateReceiptConfirmation(actor, deliveryRow)) {
        throw new ProblemError('resource-not-found');
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createReceiptConfirmation(client, deliveryRow, actor, req.body);

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/receipt-confirmations/' + encodeURIComponent(row.confirmation_id),
        },
        body: JSON.stringify(toReceiptConfirmation(row)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

module.exports = router;
