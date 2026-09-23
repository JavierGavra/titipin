'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayCreatePayment, mayReadPayment } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { validateIdempotencyKey } = require('../schemas/assignments');
const { validateAssignmentId } = require('../schemas/assignments');
const { validatePaymentId, validateCreatePaymentBody } = require('../schemas/payments');
const { getAssignmentById } = require('../store/assignments');
const { getPaymentById, createPayment } = require('../store/payments');
const { toPayment } = require('../representations/payments');
const { runIdempotent } = require('../store/idempotency');
const { sendProblem, ProblemError } = require('../problem');

const router = express.Router();

// POST /assignments/:assignmentId/payments
router.post('/assignments/:assignmentId/payments', requireScope('requests:write'), express.json(), async (req, res) => {
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

  const invalidBody = validateCreatePaymentBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match CreatePayment.',
      extensions: { invalidParameters: invalidBody },
    });
  }

  let actor;
  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client) => {
      actor = await resolveActor(req.principal, client);
      const assignment = await getAssignmentById(req.params.assignmentId, actor);
      if (!mayCreatePayment(actor, assignment)) {
        throw new ProblemError('resource-not-found');
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createPayment(client, {
        assignmentId: req.params.assignmentId,
        method: req.body.method,
      });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/payments/' + encodeURIComponent(row.payment_id),
        },
        body: JSON.stringify(toPayment(row, actor)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

// GET /payments/:paymentId
router.get('/payments/:paymentId', requireScope('payments:read'), async (req, res) => {
  const invalidParameters = validatePaymentId(req.params.paymentId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The paymentId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const row = await getPaymentById(req.params.paymentId, actor);

  if (!mayReadPayment(actor, row)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested payment was not found.',
    });
  }

  return res.status(200).json(toPayment(row, actor));
});

module.exports = router;
