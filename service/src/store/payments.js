'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError } = require('../problem');

// Kolom yang diambil; note: assigned_jastiper_id dibutuhkan oleh toPayment untuk commission visibility.
const columns = `
  p.payment_id, p.assignment_id, p.amount, p.currency, p.method,
  p.status, p.failure_reason_code, p.commission_amount,
  p.created_at, p.updated_at, p.refunded_at,
  a.assigned_jastiper_id
`;

async function getPaymentById(paymentId, actor, db = getPool()) {
  if (actor.accountId === null) {
    return null;
  }

  const result = await db.query(
    `SELECT ${columns}
     FROM public.payments p
     JOIN public.assignments a ON a.assignment_id = p.assignment_id
     WHERE p.payment_id = $1`,
    [paymentId]
  );

  return result.rows[0] ?? null;
}

// Metode simulasi: simulated_bank_transfer selalu ditolak, simulated_card selalu berhasil.
const DECLINED_METHODS = new Set(['simulated_bank_transfer']);

async function createPayment(client, { assignmentId, method }) {
  // Kunci assignment agar tidak ada pembayaran paralel.
  const assignmentResult = await client.query(
    `SELECT a.assignment_id, a.status, a.offer_id, a.assigned_jastiper_id
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

  if (assignment.status !== 'active' && assignment.status !== 'purchased') {
    throw new ProblemError('invalid-state-transition', {
      detail: 'The assignment is not in a state that permits payment.',
      extensions: {
        resourceType: 'Assignment',
        resourceId: assignmentId,
        currentStatus: assignment.status,
        allowedStatuses: ['active'],
      },
    });
  }

  // Ambil total_amount dari offer terkait sebagai amount pembayaran.
  const offerResult = await client.query(
    `SELECT total_amount, currency
     FROM public.offers
     WHERE offer_id = $1`,
    [assignment.offer_id]
  );

  const offer = offerResult.rows[0];

  if (!offer) {
    throw new ProblemError('resource-not-found', {
      detail: 'The offer for this assignment was not found.',
    });
  }

  const paymentId = 'pay_' + randomUUID();
  const declined = DECLINED_METHODS.has(method);
  const status = declined ? 'declined' : 'succeeded';
  const failureReasonCode = declined ? 'simulated_decline' : null;

  const result = await client.query(
    `INSERT INTO public.payments
       (payment_id, assignment_id, amount, currency, method, status, failure_reason_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING
       payment_id, assignment_id, amount, currency, method,
       status, failure_reason_code, commission_amount,
       created_at, updated_at, refunded_at`,
    [
      paymentId,
      assignmentId,
      offer.total_amount,
      offer.currency,
      method,
      status,
      failureReasonCode,
    ]
  );

  const row = result.rows[0];

  // Tambahkan assigned_jastiper_id ke row agar toPayment bisa menentukan commission visibility.
  row.assigned_jastiper_id = assignment.assigned_jastiper_id;

  if (declined) {
    throw new ProblemError('payment-declined', {
      extensions: {
        assignmentId,
        paymentId,
        reasonCode: failureReasonCode,
      },
    });
  }

  // Naikkan status assignment menjadi 'purchased' jika pembayaran berhasil.
  await client.query(
    `UPDATE public.assignments
     SET status = 'purchased', updated_at = CURRENT_TIMESTAMP
     WHERE assignment_id = $1`,
    [assignmentId]
  );

  return row;
}

module.exports = {
  getPaymentById,
  createPayment,
};
