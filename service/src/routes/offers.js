'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayReadOffer, mayCreateOffer } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { validateIdempotencyKey } = require('../schemas/assignments');
const { validateOfferId, validateOfferQuery, validateCreateOfferBody } = require('../schemas/offers');
const { validateRequestId } = require('../schemas/requests');
const { getOfferById, listOffersByRequest, createOffer } = require('../store/offers');
const { getRequestById } = require('../store/requests');
const { toOffer, toOfferPage } = require('../representations/offers');
const { runIdempotent } = require('../store/idempotency');
const { sendProblem, ProblemError } = require('../problem');

const router = express.Router();

// GET /requests/:requestId/offers
router.get('/requests/:requestId/offers', requireScope('requests:read'), async (req, res) => {
  const invalidId = validateRequestId(req.params.requestId);

  if (invalidId.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The requestId path parameter is invalid.',
      extensions: { invalidParameters: invalidId },
    });
  }

  const { invalidParameters, value } = validateOfferQuery(req.query);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'One or more query parameters are invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);

  if (!mayReadOffer(actor)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested item request was not found.',
    });
  }

  const request = await getRequestById(req.params.requestId, actor);

  if (!request) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested item request was not found.',
    });
  }

  const rows = await listOffersByRequest(req.params.requestId, actor, value);

  return res.status(200).json(toOfferPage(rows, value));
});

// POST /requests/:requestId/offers
router.post('/requests/:requestId/offers', requireScope('requests:fulfil'), express.json(), async (req, res) => {
  const invalidId = validateRequestId(req.params.requestId);

  if (invalidId.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The requestId path parameter is invalid.',
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

  const invalidBody = validateCreateOfferBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match CreateOffer.',
      extensions: { invalidParameters: invalidBody },
    });
  }

  let actor;
  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client, lock) => {
      actor = await resolveActor(req.principal, client);
      if (!mayCreateOffer(actor)) {
        throw new ProblemError('resource-not-found');
      }
      // Confirm the parent request exists and belongs to visible scope during lock.
      const request = await getRequestById(req.params.requestId, actor, client, lock);
      if (!request) {
        throw new ProblemError('resource-not-found', {
          detail: 'The requested item request was not found.',
        });
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createOffer(client, {
        requestId: req.params.requestId,
        jastiperId: actor.accountId,
        body: req.body,
      });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/offers/' + encodeURIComponent(row.offer_id),
        },
        body: JSON.stringify(toOffer(row)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

// GET /offers/:offerId
router.get('/offers/:offerId', requireScope('requests:read'), async (req, res) => {
  const invalidParameters = validateOfferId(req.params.offerId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The offerId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);

  if (!mayReadOffer(actor)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested offer was not found.',
    });
  }

  const row = await getOfferById(req.params.offerId, actor);

  if (!row) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested offer was not found.',
    });
  }

  return res.status(200).json(toOffer(row));
});

module.exports = router;
