'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayReadReceiptConfirmation } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { validateConfirmationId } = require('../schemas/deliveries');
const { getReceiptConfirmationById } = require('../store/receipt-confirmations');
const { toReceiptConfirmation } = require('../representations/receipt-confirmations');
const { sendProblem } = require('../problem');

const router = express.Router();

router.get('/:confirmationId', requireScope('requests:read'), async (req, res) => {
  const invalidParameters = validateConfirmationId(req.params.confirmationId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The confirmationId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const row = await getReceiptConfirmationById(req.params.confirmationId);

  if (!mayReadReceiptConfirmation(actor, row)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested receipt confirmation was not found.',
    });
  }

  return res.status(200).json(toReceiptConfirmation(row));
});

module.exports = router;
