'use strict';

const { toMoneyAmount } = require('./money');

// commission ditampilkan hanya untuk aktor yang berwenang (admin atau assigned jastiper).
// Untuk semua aktor lain commission selalu null sesuai spec.
function mayViewCommission(actor, row) {
  if (!actor) return false;
  if (actor.kind === 'user' && actor.role === 'admin') return true;
  if (actor.kind === 'user' && actor.role === 'jastiper'
      && actor.accountId === row.assigned_jastiper_id) return true;
  return false;
}

function toPayment(row, actor) {
  const currency = row.currency;

  const commission = mayViewCommission(actor, row) && row.commission_amount !== null
    ? { amount: toMoneyAmount(row.commission_amount), currency }
    : null;

  return {
    paymentId: row.payment_id,
    assignmentId: row.assignment_id,
    amount: {
      amount: toMoneyAmount(row.amount),
      currency,
    },
    method: row.method,
    status: row.status,
    failureReasonCode: row.failure_reason_code ?? null,
    commission,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    refundedAt: row.refunded_at !== null ? row.refunded_at.toISOString() : null,
  };
}

module.exports = { toPayment };
