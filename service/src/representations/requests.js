const { maySeeRequestPrivateFields } = require('../auth/ownership');

function toMoneyAmount(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.0+)?$/.test(value)) {
    throw new Error('Nominal dari database harus berupa bilangan bulat nonnegatif.');
  }

  const integerText = BigInt(value.split('.')[0]).toString();
  const amount = Number(integerText);

  if (Number.isSafeInteger(amount)) {
    return amount;
  }

  return JSON.rawJSON(integerText);
}

function toRequest(row, actor) {
  const showPrivate = !actor || maySeeRequestPrivateFields(actor, row);
  const result = {
    requestId: row.request_id,
    itemDescription: row.item_description,
    quantity: row.quantity,
    targetStoreOrArea: row.target_store_or_area,
    budget: {
      amount: toMoneyAmount(row.budget_amount),
      currency: row.budget_currency,
    },
    deadline: row.deadline.toISOString(),
    status: row.status,
    selectedOfferId: row.selected_offer_id,
    assignedJastiperId: row.assigned_jastiper_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
  if (showPrivate) {
    result.requesterId = row.requester_id;
    result.deliveryAddress = row.delivery_address;
  }
  return result;
}

function toRequestPage(rows, { limit, offset }, actor) {
  const hasMore = rows.length > limit;

  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({ offset: offset + limit }),
        'utf8'
      ).toString('base64url')
    : null;

  return {
    items: rows.slice(0, limit).map((row) => toRequest(row, actor)),
    page: {
      limit,
      nextCursor,
      hasMore,
    },
  };
}

module.exports = {
  toRequest,
  toRequestPage,
};