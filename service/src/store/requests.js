const { getPool } = require('./db')

async function getRequestById(requestId) {
  const result = await getPool().query(
    `SELECT
       r.request_id,
       r.requester_id,
       r.item_description,
       r.quantity,
       r.target_store_or_area,
       r.budget_amount,
       r.budget_currency,
       r.delivery_address,
       r.deadline,
       r.status,
       a.offer_id AS selected_offer_id,
       a.assigned_jastiper_id,
       r.created_at,
       r.updated_at
     FROM public.requests AS r
     LEFT JOIN public.assignments AS a
       ON a.request_id = r.request_id
     WHERE r.request_id = $1`,
    [requestId]
  )

  return result.rows[0] ?? null
}

async function listRequests({ status, limit, offset }) {
  const result = await getPool().query(
    `SELECT
       r.request_id,
       r.requester_id,
       r.item_description,
       r.quantity,
       r.target_store_or_area,
       r.budget_amount,
       r.budget_currency,
       r.delivery_address,
       r.deadline,
       r.status,
       a.offer_id AS selected_offer_id,
       a.assigned_jastiper_id,
       r.created_at,
       r.updated_at
     FROM public.requests AS r
     LEFT JOIN public.assignments AS a
       ON a.request_id = r.request_id
     WHERE ($1::text IS NULL OR r.status = $1)
     ORDER BY r.created_at DESC, r.request_id DESC
     LIMIT $2 OFFSET $3`,
    [status, limit + 1, offset]
  );

  return result.rows;
}
module.exports = {
  getRequestById,
  listRequests,
}