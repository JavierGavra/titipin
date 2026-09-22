const { requireScope } = require('../auth/require-scope');
const { authenticate } = require('../auth/authenticate');
const { mayReadRequest, maySelectOffer, mayCreateRequest } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const {
  validateSelectOfferBody,
  validateIdempotencyKey,
} = require('../schemas/assignments');

const { createAssignment } = require('../store/assignments');
const { toAssignment } = require('../representations/assignments');
const { runIdempotent } = require('../store/idempotency');

const express = require('express');
const {
  validateRequestId,
  validateRequestQuery,
  validateCreateRequestBody,
} = require('../schemas/requests');;
const {
  getRequestById,
  listRequests,
  createRequest,
} = require('../store/requests');
const {
  toRequest,
  toRequestPage,
} = require('../representations/requests');
const { sendProblem, ProblemError } = require('../problem');

const router = express.Router();

router.get('/', async (req, res, next) => {
  const { invalidParameters, value } = validateRequestQuery(req.query);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'One or more query parameters are invalid.',
      extensions: { invalidParameters },
    });
  }

  return authenticate(req, res, async () => requireScope('requests:read')(req, res, async () => {
    const actor = await resolveActor(req.principal);
    const rows = await listRequests(actor, value);
    return res.status(200).json(toRequestPage(rows, value, actor));
  }));
});

router.get('/:requestId', async (req, res) => {
  const invalidParameters = validateRequestId(req.params.requestId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The requestId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  return authenticate(req, res, async () => requireScope('requests:read')(req, res, async () => {
    const actor = await resolveActor(req.principal);
    const row = await getRequestById(req.params.requestId, actor);
    if (!mayReadRequest(actor, row)) { // mutation: request-owner
      return sendProblem(res, 'resource-not-found', {
        detail: 'The requested item request was not found.',
      });
    }
    return res.status(200).json(toRequest(row, actor));
  }));
});

router.post('/:requestId/assignments', authenticate, requireScope('requests:write'), express.json(), async (req, res) => {
  const invalidId = validateRequestId(req.params.requestId);

  if (invalidId.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The requestId path parameter is invalid.',
      extensions: {
        invalidParameters: invalidId,
      },
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

  const invalidBody = validateSelectOfferBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match SelectOfferRequest.',
      extensions: {
        invalidParameters: invalidBody,
      },
    });
  }

  let request;
  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client, lock) => {
      const actor = await resolveActor(req.principal, client);
      request = await getRequestById(req.params.requestId, actor, client, lock);
      if (!maySelectOffer(actor, request)) {
        throw new ProblemError('resource-not-found');
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createAssignment(client, {
        requestId: req.params.requestId,
        offerId: req.body.offerId,
      }, request);

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/assignments/' + encodeURIComponent(row.assignment_id),
        },
        body: JSON.stringify(toAssignment(row)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

router.post('/', authenticate, requireScope('requests:write'), express.json(), async (req, res) => {
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

  const invalidBody = validateCreateRequestBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match CreateRequest.',
      extensions: {
        invalidParameters: invalidBody,
      },
    });
  }

  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client) => {
      const actor = await resolveActor(req.principal, client);
      if (!mayCreateRequest(actor)) {
        throw new ProblemError('resource-not-found');
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const actor = await resolveActor(req.principal, client);
      const row = await createRequest(client, {
        requesterId: actor.accountId,
        body: req.body,
      });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/requests/' + encodeURIComponent(row.request_id),
        },
        body: JSON.stringify(toRequest(row, actor)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

module.exports = router;