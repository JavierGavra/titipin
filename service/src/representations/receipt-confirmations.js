'use strict';

function toReceiptConfirmation(row) {
  return {
    confirmationId: row.confirmation_id,
    deliveryId: row.delivery_id,
    confirmedByAccountId: row.confirmed_by_account_id,
    confirmedAt: row.confirmed_at instanceof Date
      ? row.confirmed_at.toISOString()
      : row.confirmed_at,
    recipientName: row.recipient_name,
    note: row.note ?? null,
  };
}

module.exports = { toReceiptConfirmation };
