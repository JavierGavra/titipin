const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError } = require('../problem');

const columns = `
  assignment_id, request_id, offer_id, assigned_jastiper_id,
  status, assigned_at, purchase_recorded_at, completed_at, updated_at
`;

async function getAssignmentById(assignmentId) {
  const result = await getPool().query(
    `SELECT ${columns}
     FROM public.assignments
     WHERE assignment_id = $1`,
    [assignmentId]
  );

  return result.rows[0] ?? null;
}

async function createAssignment(client, { requestId, offerId }) {
  const requestResult = await client.query(
    `SELECT request_id, status, deadline
     FROM public.requests
     WHERE request_id = $1
     FOR UPDATE`,
    [requestId]
  );

  const request = requestResult.rows[0];

  if (!request) {
    throw new ProblemError('resource-not-found', {
      detail: 'The requested item request was not found.',
      extensions: {
        resourceType: 'Request',
        resourceId: requestId,
      },
    });
  }

  const existing = await client.query(
    `SELECT assignment_id, offer_id
     FROM public.assignments
     WHERE request_id = $1`,
    [requestId]
  );

  if (existing.rows[0]) {
    throw new ProblemError('offer-already-selected', {
      extensions: {
        requestId,
        assignmentId: existing.rows[0].assignment_id,
        selectedOfferId: existing.rows[0].offer_id,
      },
    });
  }

  function invalidReference(message) {
    return new ProblemError('validation-failed', {
      detail: message,
      extensions: {
        errors: [{
          field: 'offerId',
          code: 'invalid_reference',
          message,
        }],
      },
    });
  }

  if (offerId.includes('\u0000')) {
    throw invalidReference('The selected offer does not exist.');
  }

  const offerResult = await client.query(
    `SELECT offer_id, request_id, jastiper_id, status, expires_at
     FROM public.offers
     WHERE offer_id = $1
     FOR UPDATE`,
    [offerId]
  );

  const offer = offerResult.rows[0];

  if (!offer || offer.request_id !== requestId) {
    throw invalidReference(
      'The selected offer must exist and belong to this request.'
    );
  }

  const clock = await client.query('SELECT clock_timestamp() AS now');
  const now = clock.rows[0].now;

  if (request.status !== 'open' || request.deadline <= now) {
    throw new ProblemError('invalid-state-transition', {
      detail: 'The request must be open and its deadline must not have passed.',
      extensions: {
        resourceType: 'Request',
        resourceId: requestId,
        currentStatus: request.status,
        allowedStatuses: ['open'],
      },
    });
  }

  if (offer.status !== 'active' || offer.expires_at <= now) {
    throw new ProblemError('invalid-state-transition', {
      detail: 'The offer must be active and must not have expired.',
      extensions: {
        resourceType: 'Offer',
        resourceId: offerId,
        currentStatus: offer.status,
        allowedStatuses: ['active'],
      },
    });
  }

  const created = await client.query(
    `INSERT INTO public.assignments
       (assignment_id, request_id, offer_id, assigned_jastiper_id)
     VALUES ($1, $2, $3, $4)
     RETURNING ${columns}`,
    ['asg_' + randomUUID(), requestId, offerId, offer.jastiper_id]
  );

  await client.query(
    `UPDATE public.requests
     SET status = 'assigned', updated_at = CURRENT_TIMESTAMP
     WHERE request_id = $1`,
    [requestId]
  );

  await client.query(
    `UPDATE public.offers
     SET status = 'selected'
     WHERE offer_id = $1`,
    [offerId]
  );

  return created.rows[0];
}

module.exports = {
  getAssignmentById,
  createAssignment,
};