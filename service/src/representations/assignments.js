function toAssignment(row) {
  return {
    assignmentId: row.assignment_id,
    requestId: row.request_id,
    offerId: row.offer_id,
    assignedJastiperId: row.assigned_jastiper_id,
    status: row.status,
    assignedAt: row.assigned_at.toISOString(),
    purchaseRecordedAt: row.purchase_recorded_at === null
      ? null
      : row.purchase_recorded_at.toISOString(),
    completedAt: row.completed_at === null
      ? null
      : row.completed_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

module.exports = { toAssignment };