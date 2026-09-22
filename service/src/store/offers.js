'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError } = require('../problem');

const columns = `
  offer_id, request_id, jastiper_id, status,
  item_price_amount, service_fee_amount, delivery_fee_amount, total_amount,
  currency, estimated_arrival_at, stock_checked_at, expires_at,
  note, created_at
`;

async function getOfferById(offerId, actor, db = getPool()) {
  const result = await db.query(
    `SELECT ${columns}
     FROM public.offers
     WHERE offer_id = $1`,
    [offerId]
  );

  const row = result.rows[0] ?? null;

  if (!row) {
    return null;
  }

  // Otorisasi: semua role yang terautentikasi boleh membaca offer.
  // Visibilitas sudah dijamin oleh scope requests:read di route layer.
  if (actor.accountId === null) {
    return null;
  }

  return row;
}

async function listOffersByRequest(requestId, actor, { status, limit, offset }, db = getPool()) {
  const result = await db.query(
    `SELECT ${columns}
     FROM public.offers
     WHERE request_id = $1
       AND ($2::text IS NULL OR offers.status = $2)
     ORDER BY created_at DESC, offer_id DESC
     LIMIT $3 OFFSET $4`,
    [requestId, status, limit + 1, offset]
  );

  return result.rows;
}

async function createOffer(client, { requestId, jastiperId, body }) {
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
    });
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

  const offerId = 'off_' + randomUUID();

  const result = await client.query(
    `INSERT INTO public.offers
       (offer_id, request_id, jastiper_id,
        item_price_amount, service_fee_amount, delivery_fee_amount,
        currency, estimated_arrival_at, stock_checked_at, expires_at, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${columns}`,
    [
      offerId,
      requestId,
      jastiperId,
      body.itemPrice.amount,
      body.serviceFee.amount,
      body.deliveryFee.amount,
      body.itemPrice.currency,
      body.estimatedArrivalAt,
      body.stockCheckedAt,
      body.expiresAt,
      body.note ?? null,
    ]
  );

  return result.rows[0];
}

module.exports = {
  getOfferById,
  listOffersByRequest,
  createOffer,
};
