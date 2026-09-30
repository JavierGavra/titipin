'use strict';

function toResolution(row) {
  if (!row) return null;

  return {
    outcome: row.outcome,
    note: row.note,
    resolvedAt: row.resolved_at instanceof Date
      ? row.resolved_at.toISOString()
      : row.resolved_at,
    resolvedByAccountId: row.resolved_by_account_id,
  };
}

function toIssue(row) {
  return {
    issueId: row.issue_id,
    createdByAccountId: row.created_by_account_id,
    requestId: row.request_id,
    assignmentId: row.assignment_id,
    paymentId: row.payment_id,
    deliveryId: row.delivery_id ?? null,
    category: row.category,
    description: row.description,
    status: row.status,
    notes: row.notes ?? null,
    resolution: toResolution(row.resolution),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toIssuePage(rows, { limit, offset }) {
  const hasMore = rows.length > limit;

  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({ offset: offset + limit }),
        'utf8'
      ).toString('base64url')
    : null;

  return {
    items: rows.slice(0, limit).map(toIssue),
    page: {
      limit,
      nextCursor,
      hasMore,
    },
  };
}

module.exports = { toIssue, toIssuePage };
