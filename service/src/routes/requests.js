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

module.exports = router;