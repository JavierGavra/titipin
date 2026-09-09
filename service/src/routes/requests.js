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
} = require('../schemas/requests');;
const {
  getRequestById,
  listRequests,
} = require('../store/requests');
const {
  toRequest,
  toRequestPage,
} = require('../representations/requests');
const { sendProblem } = require('../problem');

const router = express.Router();

router.get('/', async (req, res) => {
  const { invalidParameters, value } = validateRequestQuery(req.query);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'One or more query parameters are invalid.',
      extensions: { invalidParameters },
    });
  }

  const rows = await listRequests(value);

  return res.status(200).json(toRequestPage(rows, value));
});

router.get('/:requestId', async (req, res) => {
  const invalidParameters = validateRequestId(req.params.requestId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The requestId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const row = await getRequestById(req.params.requestId);

  if (row === null) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested item request was not found.',
    });
  }

  return res.status(200).json(toRequest(row));
});

router.post('/:requestId/assignments', async (req, res) => {
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

  const response = await runIdempotent({
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createAssignment(client, {
        requestId: req.params.requestId,
        offerId: req.body.offerId,
      });

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

module.exports = router;