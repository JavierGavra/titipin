'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayReadAccount } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { validateAccountId } = require('../schemas/accounts');
const { getAccountById } = require('../store/accounts');
const { toAccount } = require('../representations/accounts');
const { sendProblem } = require('../problem');

const router = express.Router();

router.get('/:accountId', requireScope('accounts:read'), async (req, res) => {
  const invalidParameters = validateAccountId(req.params.accountId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The accountId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const row = await getAccountById(req.params.accountId);

  if (!mayReadAccount(actor, row)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested account was not found.',
    });
  }

  return res.status(200).json(toAccount(row));
});

module.exports = router;
