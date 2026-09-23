'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError } = require('../problem');

async function getDeliveryById(deliveryId, actor, db = getPool(), lock = false) {
  const result = await db.query(
    `SELECT d.*,
       a.request_id, a.assigned_jastiper_id, r.requester_id,
       rc.confirmed_at,
       (SELECT row_to_json(lu)
          FROM (SELECT latitude, longitude, recorded_at
                FROM public.location_updates
                WHERE delivery_id = d.delivery_id
                ORDER BY recorded_at DESC, location_id DESC
                LIMIT 1) lu) AS last_location,
       EXISTS (SELECT 1 FROM public.tracker_deliveries t
         WHERE t.delivery_id = d.delivery_id AND t.issuer = $2
           AND t.subject = $3 AND t.client_id = $4) AS tracker_access
     FROM public.deliveries d
     JOIN public.assignments a ON a.assignment_id = d.assignment_id
     JOIN public.requests r ON r.request_id = a.request_id
     LEFT JOIN public.receipt_confirmations rc ON rc.delivery_id = d.delivery_id
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

async function createDelivery(client, { assignmentId, body }) {
  const assignmentResult = await client.query(
    `SELECT a.assignment_id, a.status, a.offer_id, a.request_id, a.assigned_jastiper_id
     FROM public.assignments a
     WHERE a.assignment_id = $1
     FOR UPDATE`,
    [assignmentId]
  );

  const assignment = assignmentResult.rows[0];

  if (!assignment) {
    throw new ProblemError('resource-not-found', {
      detail: 'The requested assignment was not found.',
    });
  }

  if (!['active', 'purchased'].includes(assignment.status)) {
    throw new ProblemError('invalid-state-transition', {
      detail: 'The assignment is not in a state that permits delivery creation.',
      extensions: {
        resourceType: 'Assignment',
        resourceId: assignmentId,
        currentStatus: assignment.status,
        allowedStatuses: ['active', 'purchased'],
      },
    });
  }

  // Verifikasi pembayaran telah berhasil sebelum delivery bisa dibuat.
  const paymentResult = await client.query(
    `SELECT payment_id, status
     FROM public.payments
     WHERE assignment_id = $1 AND status = 'succeeded'
     LIMIT 1`,
    [assignmentId]
  );

  if (!paymentResult.rows[0]) {
    // Temukan payment terakhir untuk memberikan konteks error yang lebih baik.
    const latestPayment = await client.query(
      `SELECT payment_id, status
       FROM public.payments
       WHERE assignment_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [assignmentId]
    );
    const latest = latestPayment.rows[0];
    throw new ProblemError('payment-not-succeeded', {
      extensions: {
        assignmentId,
        paymentId: latest?.payment_id ?? null,
        paymentStatus: latest?.status ?? null,
      },
    });
  }

  // Ambil delivery_address dari request terkait.
  const requestResult = await client.query(
    `SELECT delivery_address
     FROM public.requests
     WHERE request_id = $1`,
    [assignment.request_id]
  );

  const deliveryAddress = requestResult.rows[0]?.delivery_address ?? '';
  const deliveryId = 'dlv_' + randomUUID();

  const result = await client.query(
    `INSERT INTO public.deliveries
       (delivery_id, assignment_id, delivery_address)
     VALUES ($1, $2, $3)
     RETURNING delivery_id, assignment_id, status, delivery_address, created_at, started_at, delivered_at`,
    [deliveryId, assignmentId, deliveryAddress]
  );

  const row = result.rows[0];

  // Registrasi waktu pembelian di assignment.
  await client.query(
    `UPDATE public.assignments
     SET purchase_recorded_at = $2, status = 'purchased', updated_at = CURRENT_TIMESTAMP
     WHERE assignment_id = $1 AND purchase_recorded_at IS NULL`,
    [assignmentId, body.purchaseRecordedAt]
  );

  // Tambahkan field dari JOIN yang dibutuhkan oleh toDelivery.
  row.last_location = null;
  row.confirmed_at = null;

  return row;
}

module.exports = { getDeliveryById, appendLocation, createDelivery };

