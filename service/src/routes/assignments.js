'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayReadAssignment, mayCreateDelivery } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { validateAssignmentId, validateIdempotencyKey } = require('../schemas/assignments');
const { validateCreateDeliveryBody } = require('../schemas/deliveries');
const { getAssignmentById } = require('../store/assignments');
const { createDelivery } = require('../store/deliveries');
const { toDelivery } = require('../representations/deliveries');
const { toAssignment } = require('../representations/assignments');
const { runIdempotent } = require('../store/idempotency');
const { sendProblem, ProblemError } = require('../problem');

const router = express.Router();

router.get('/:assignmentId', requireScope('requests:read'), async (req, res) => {
  const invalidParameters = validateAssignmentId(
    req.params.assignmentId
  );

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The assignmentId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const row = await getAssignmentById(req.params.assignmentId, actor);

  if (!mayReadAssignment(actor, row)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested assignment was not found.',
    });
  }

  return res.status(200).json(toAssignment(row));
});

router.post('/:assignmentId/deliveries', requireScope('requests:fulfil'), express.json(), async (req, res) => {
  const invalidId = validateAssignmentId(req.params.assignmentId);

  if (invalidId.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The assignmentId path parameter is invalid.',
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

  const invalidBody = validateCreateDeliveryBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match CreateDelivery.',
      extensions: { invalidParameters: invalidBody },
    });
  }

  let actor;
  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client) => {
      actor = await resolveActor(req.principal, client);
      const assignment = await getAssignmentById(req.params.assignmentId, actor);
      if (!mayCreateDelivery(actor, assignment)) {
        throw new ProblemError('resource-not-found');
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createDelivery(client, {
        assignmentId: req.params.assignmentId,
        body: req.body,
      });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/deliveries/' + encodeURIComponent(row.delivery_id),
        },
        body: JSON.stringify(toDelivery(row)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

module.exports = router;