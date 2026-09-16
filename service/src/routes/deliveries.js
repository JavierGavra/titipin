'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayWriteLocation } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { getDeliveryById, appendLocation } = require('../store/deliveries');
const { runIdempotent } = require('../store/idempotency');
const { validateIdempotencyKey } = require('../schemas/assignments');
const { validateDeliveryId, validateLocationBody } = require('../schemas/deliveries');
const { toLocation } = require('../representations/deliveries');
const { sendProblem, ProblemError } = require('../problem');

const router = express.Router();
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

module.exports = router;
