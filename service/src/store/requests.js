const { getPool } = require('./db')

async function getRequestById(requestId, actor, db = getPool(), lock = false) {
  const result = await db.query(
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
       r.updated_at,
       EXISTS (SELECT 1 FROM public.request_access ra
         WHERE ra.request_id = r.request_id AND ra.issuer = $2 AND ra.subject = $3) AS operational_access
     FROM public.requests AS r
     LEFT JOIN public.assignments AS a
       ON a.request_id = r.request_id
     WHERE r.request_id = $1 ${lock ? 'FOR UPDATE OF r' : ''}`,
    [requestId, actor.issuer, actor.subject]
  )

  return result.rows[0] ?? null
}

async function listRequests(actor, { status, limit, offset }) {
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
       r.updated_at,
       EXISTS (SELECT 1 FROM public.request_access ra
         WHERE ra.request_id = r.request_id AND ra.issuer = $2 AND ra.subject = $3) AS operational_access
     FROM public.requests AS r
     LEFT JOIN public.assignments AS a
       ON a.request_id = r.request_id
     WHERE ($1::text IS NULL OR r.status = $1)
       AND (
         ($4::text = 'requester' AND $5::text = 'user' AND r.requester_id = $6)
         OR ($4 = 'jastiper' AND $5 = 'user' AND $7::text = 'verified' AND (
           a.assigned_jastiper_id = $6 OR (
             r.status = 'open' AND r.deadline > clock_timestamp() AND a.assignment_id IS NULL
           )
         ))
         OR ((($4 = 'admin' AND $5 = 'user') OR $8::boolean) AND EXISTS (
           SELECT 1 FROM public.request_access ra
            WHERE ra.request_id = r.request_id AND ra.issuer = $2 AND ra.subject = $3
         ))
       )
     ORDER BY r.created_at DESC, r.request_id DESC
     LIMIT $9 OFFSET $10`,
    [status, actor.issuer, actor.subject, actor.role, actor.kind, actor.accountId,
      actor.verificationStatus,
      actor.kind === 'service' && actor.roles.includes('mcp-reader'), limit + 1, offset]
  );

  return result.rows;
}
module.exports = {
  getRequestById,
  listRequests,
}