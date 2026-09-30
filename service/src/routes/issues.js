'use strict';

const express = require('express');
const { requireScope } = require('../auth/require-scope');
const { mayReadIssue, mayCreateIssue, mayResolveIssue } = require('../auth/ownership');
const { resolveActor } = require('../store/identities');
const { validateIdempotencyKey } = require('../schemas/assignments');
const { validateIssueId, validateIssueQuery, validateCreateIssueBody, validateIssueResolutionBody } = require('../schemas/issues');
const { getIssueById, listIssues, createIssue, createIssueResolution } = require('../store/issues');
const { toIssue, toIssuePage } = require('../representations/issues');
const { runIdempotent } = require('../store/idempotency');
const { sendProblem, ProblemError } = require('../problem');

const router = express.Router();

// GET /issues — hanya admin
router.get('/', requireScope('issues:read'), async (req, res) => {
  const { invalidParameters, value } = validateIssueQuery(req.query);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'One or more query parameters are invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);

  if (!mayReadIssue(actor, { issue_id: 'gate' })) {
    return sendProblem(res, 'resource-not-found');
  }

  const rows = await listIssues(value);

  return res.status(200).json(toIssuePage(rows, value));
});

// POST /issues — requester, jastiper, admin
router.post('/', requireScope('issues:write'), express.json(), async (req, res) => {
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

  const invalidBody = validateCreateIssueBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match CreateIssue.',
      extensions: { invalidParameters: invalidBody },
    });
  }

  let actor;
  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client) => {
      actor = await resolveActor(req.principal, client);
      if (!mayCreateIssue(actor)) {
        throw new ProblemError('resource-not-found');
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createIssue(client, {
        actorAccountId: actor.accountId,
        body: req.body,
      });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/issues/' + encodeURIComponent(row.issue_id),
        },
        body: JSON.stringify(toIssue(row)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

// GET /issues/:issueId — hanya admin
router.get('/:issueId', requireScope('issues:read'), async (req, res) => {
  const invalidParameters = validateIssueId(req.params.issueId);

  if (invalidParameters.length > 0) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The issueId path parameter is invalid.',
      extensions: { invalidParameters },
    });
  }

  const actor = await resolveActor(req.principal);
  const row = await getIssueById(req.params.issueId);

  if (!mayReadIssue(actor, row)) {
    return sendProblem(res, 'resource-not-found', {
      detail: 'The requested issue was not found.',
    });
  }

  return res.status(200).json(toIssue(row));
});

// POST /issues/:issueId/resolutions — hanya admin
router.post('/:issueId/resolutions', requireScope('issues:write'), express.json(), async (req, res) => {
  const invalidId = validateIssueId(req.params.issueId);

  if (invalidId.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The issueId path parameter is invalid.',
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

  const invalidBody = validateIssueResolutionBody(req.body);

  if (invalidBody.length) {
    return sendProblem(res, 'invalid-request', {
      detail: 'The request body does not match CreateIssueResolution.',
      extensions: { invalidParameters: invalidBody },
    });
  }

  let actor;
  const response = await runIdempotent({
    principal: req.principal,
    authorize: async (client) => {
      actor = await resolveActor(req.principal, client);
      const issue = await getIssueById(req.params.issueId, client);
      if (!mayResolveIssue(actor, issue)) {
        throw new ProblemError('resource-not-found');
      }
    },
    key,
    method: req.method,
    uri: req.originalUrl,
    body: req.body,

    execute: async (client) => {
      const row = await createIssueResolution(client, {
        issueId: req.params.issueId,
        resolverAccountId: actor.accountId,
        body: req.body,
      });

      return {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          Location: '/v1/issues/' + encodeURIComponent(row.issue_id) + '/resolutions',
        },
        body: JSON.stringify(toIssue(row)),
      };
    },
  });

  return res
    .status(response.status)
    .set(response.headers)
    .send(response.body);
});

module.exports = router;
