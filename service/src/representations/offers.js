'use strict';

const { toMoneyAmount } = require('./money');

function toOffer(row) {
  const currency = row.currency;

  return {
    offerId: row.offer_id,
    requestId: row.request_id,
    jastiperId: row.jastiper_id,
    status: row.status,
    itemPrice: {
      amount: toMoneyAmount(row.item_price_amount),
      currency,
    },
    serviceFee: {
      amount: toMoneyAmount(row.service_fee_amount),
      currency,
    },
    deliveryFee: {
      amount: toMoneyAmount(row.delivery_fee_amount),
      currency,
    },
    totalAmount: {
      amount: toMoneyAmount(row.total_amount),
      currency,
    },
    estimatedArrivalAt: row.estimated_arrival_at.toISOString(),
    stockCheckedAt: row.stock_checked_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    note: row.note ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function toOfferPage(rows, { limit, offset }) {
  const hasMore = rows.length > limit;

  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({ offset: offset + limit }),
        'utf8'
      ).toString('base64url')
    : null;

  return {
    items: rows.slice(0, limit).map(toOffer),
    page: {
      limit,
      nextCursor,
      hasMore,
    },
  };
}

module.exports = {
  toOffer,
  toOfferPage,
};
