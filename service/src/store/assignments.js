const { getPool } = require('./db');

async function getAssignmentById(assignmentId) {
  const result = await getPool().query(
    `SELECT
       assignment_id,
       request_id,
       offer_id,
       assigned_jastiper_id,
       status,
       assigned_at,
       purchase_recorded_at,
       completed_at,
       updated_at
     FROM public.assignments
     WHERE assignment_id = $1`,
    [assignmentId]
  );

  return result.rows[0] ?? null;
}

module.exports = { getAssignmentById };