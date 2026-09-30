'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError } = require('../problem');

// Kolom yang cukup untuk toReceiptConfirmation + mayReadReceiptConfirmation.
const columns = `
  rc.confirmation_id, rc.delivery_id, rc.confirmed_by_account_id,
  rc.confirmed_at, rc.recipient_name, rc.note,
  r.requester_id, a.assigned_jastiper_id
`;

async function getReceiptConfirmationById(confirmationId, db = getPool()) {
  const result = await db.query(
    `SELECT ${columns}
     FROM public.receipt_confirmations rc
     JOIN public.deliveries d ON d.delivery_id = rc.delivery_id
     JOIN public.assignments a ON a.assignment_id = d.assignment_id
     JOIN public.requests r ON r.request_id = a.request_id
     WHERE rc.confirmation_id = $1`,
    [confirmationId]
  );

  return result.rows[0] ?? null;
}

async function createReceiptConfirmation(client, deliveryRow, actor, body) {
  const deliveryId = deliveryRow.delivery_id;

  // Lock delivery + assignment agar tidak ada konfirmasi paralel.
  const lockedResult = await client.query(
    `SELECT d.delivery_id, d.status, d.assignment_id,
            a.request_id, a.status AS assignment_status
     FROM public.deliveries d
     JOIN public.assignments a ON a.assignment_id = d.assignment_id
     WHERE d.delivery_id = $1
     FOR UPDATE OF d, a`,
    [deliveryId]
  );

  const delivery = lockedResult.rows[0];

  if (!delivery) {
    throw new ProblemError('resource-not-found', {
      detail: 'The requested delivery was not found.',
    });
  }

  // Cek apakah sudah ada konfirmasi sebelumnya.
  const existingResult = await client.query(
    `SELECT confirmation_id, confirmed_at
     FROM public.receipt_confirmations
     WHERE delivery_id = $1`,
    [deliveryId]
  );

  if (existingResult.rows[0]) {
    const existing = existingResult.rows[0];
    throw new ProblemError('receipt-already-confirmed', {
      extensions: {
        deliveryId,
        confirmationId: existing.confirmation_id,
        confirmedAt: existing.confirmed_at instanceof Date
          ? existing.confirmed_at.toISOString()
          : existing.confirmed_at,
      },
    });
  }

  // Delivery harus dalam status 'delivered' agar bisa dikonfirmasi.
  if (delivery.status !== 'delivered') {
    throw new ProblemError('invalid-state-transition', {
      detail: 'The delivery is not ready for receipt confirmation.',
      extensions: {
        resourceType: 'Delivery',
        resourceId: deliveryId,
        currentStatus: delivery.status,
        allowedStatuses: ['delivered'],
      },
    });
  }

  const confirmationId = 'rcp_' + randomUUID();

  const result = await client.query(
    `INSERT INTO public.receipt_confirmations
       (confirmation_id, delivery_id, confirmed_by_account_id, confirmed_at, recipient_name, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING confirmation_id, delivery_id, confirmed_by_account_id, confirmed_at, recipient_name, note`,
    [
      confirmationId,
      deliveryId,
      actor.accountId,
      body.confirmedAt,
      body.recipientName,
      body.note ?? null,
    ]
  );

  const row = result.rows[0];

  // Naikkan status delivery ke 'confirmed'.
  await client.query(
    `UPDATE public.deliveries
     SET status = 'confirmed'
     WHERE delivery_id = $1`,
    [deliveryId]
  );

  // Tandai assignment sebagai completed, catat waktu selesai.
  await client.query(
    `UPDATE public.assignments
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE assignment_id = $1`,
    [delivery.assignment_id]
  );

  // Tandai request sebagai completed.
  await client.query(
    `UPDATE public.requests
     SET status = 'completed', updated_at = CURRENT_TIMESTAMP
     WHERE request_id = $1`,
    [delivery.request_id]
  );

  // Tambahkan field JOIN yang dibutuhkan oleh mayReadReceiptConfirmation.
  row.requester_id = deliveryRow.requester_id;
  row.assigned_jastiper_id = deliveryRow.assigned_jastiper_id;

  return row;
}

module.exports = { getReceiptConfirmationById, createReceiptConfirmation };
