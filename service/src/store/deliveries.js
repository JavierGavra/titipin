'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError } = require('../problem');

async function getDeliveryById(deliveryId, actor, db = getPool(), lock = false) {
  const result = await db.query(
    `SELECT d.*, a.request_id, a.assigned_jastiper_id, r.requester_id,
       EXISTS (SELECT 1 FROM public.tracker_deliveries t
         WHERE t.delivery_id = d.delivery_id AND t.issuer = $2
           AND t.subject = $3 AND t.client_id = $4) AS tracker_access
       FROM public.deliveries d
       JOIN public.assignments a ON a.assignment_id = d.assignment_id
       JOIN public.requests r ON r.request_id = a.request_id
      WHERE d.delivery_id = $1 ${lock ? 'FOR UPDATE OF d, a' : ''}`,
    [deliveryId, actor.issuer, actor.subject, actor.clientId]
  );
  return result.rows[0] ?? null;
}

// The handler has authorized the locked delivery before this function is called.
async function appendLocation(client, delivery, body) {
  if (!['pending', 'in_transit'].includes(delivery.status)) {
    throw new ProblemError('invalid-state-transition');
  }
  const result = await client.query(
    `INSERT INTO public.location_updates
       (location_id, delivery_id, latitude, longitude, recorded_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    ['loc_' + randomUUID(), delivery.delivery_id, body.latitude, body.longitude, body.recordedAt]
  );
  await client.query(
    `UPDATE public.deliveries
        SET status = 'in_transit', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE delivery_id = $1 AND status = 'pending'`, [delivery.delivery_id]
  );
  return result.rows[0];
}

module.exports = { getDeliveryById, appendLocation };
