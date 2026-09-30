'use strict';

const { randomUUID } = require('node:crypto');
const { getPool } = require('./db');
const { ProblemError } = require('../problem');

// resolution di-JOIN sebagai nested object; row_to_json mengembalikan null jika tidak ada.
const columns = `
  i.issue_id, i.created_by_account_id,
  i.request_id, i.assignment_id, i.payment_id, i.delivery_id,
  i.category, i.description, i.status, i.notes,
  i.created_at, i.updated_at,
  row_to_json(ir) AS resolution
`;

const fromClause = `
  FROM public.transaction_issues i
  LEFT JOIN public.issue_resolutions ir ON ir.issue_id = i.issue_id
`;

async function getIssueById(issueId, db = getPool()) {
  const result = await db.query(
    `SELECT ${columns} ${fromClause} WHERE i.issue_id = $1`,
    [issueId]
  );

  return result.rows[0] ?? null;
}

async function listIssues({ status, limit, offset }, db = getPool()) {
  const result = await db.query(
    `SELECT ${columns} ${fromClause}
     WHERE ($1::text IS NULL OR i.status = $1)
     ORDER BY i.created_at DESC, i.issue_id DESC
     LIMIT $2 OFFSET $3`,
    [status, limit + 1, offset]
  );

  return result.rows;
}

async function createIssue(client, { actorAccountId, body }) {
  const issueId = 'iss_' + randomUUID();

  const result = await client.query(
    `INSERT INTO public.transaction_issues
       (issue_id, created_by_account_id,
        request_id, assignment_id, payment_id, delivery_id,
        category, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING
       issue_id, created_by_account_id,
       request_id, assignment_id, payment_id, delivery_id,
       category, description, status, notes,
       created_at, updated_at`,
    [
      issueId,
      actorAccountId,
      body.requestId,
      body.assignmentId,
      body.paymentId,
      body.deliveryId ?? null,
      body.category,
      body.description,
    ]
  );

  const row = result.rows[0];

  // resolution baru selalu null.
  row.resolution = null;

  return row;
}

async function createIssueResolution(client, { issueId, resolverAccountId, body }) {
  // Lock issue agar tidak ada resolusi paralel.
  const issueResult = await client.query(
    `SELECT issue_id, status FROM public.transaction_issues WHERE issue_id = $1 FOR UPDATE`,
    [issueId]
  );

  const issue = issueResult.rows[0];

  if (!issue) {
    throw new ProblemError('resource-not-found', {
      detail: 'The requested issue was not found.',
    });
  }

  if (issue.status === 'resolved') {
    // Cek apakah sudah ada resolusi sebelumnya untuk konteks error.
    const existingResult = await client.query(
      `SELECT resolved_at FROM public.issue_resolutions WHERE issue_id = $1`,
      [issueId]
    );
    const existing = existingResult.rows[0];
    throw new ProblemError('issue-already-resolved', {
      extensions: {
        issueId,
        resolvedAt: existing?.resolved_at instanceof Date
          ? existing.resolved_at.toISOString()
          : existing?.resolved_at ?? null,
      },
    });
  }

  if (!['open', 'in_review'].includes(issue.status)) {
    throw new ProblemError('invalid-state-transition', {
      detail: 'The issue is not in a state that permits resolution.',
      extensions: {
        resourceType: 'TransactionIssue',
        resourceId: issueId,
        currentStatus: issue.status,
        allowedStatuses: ['open', 'in_review'],
      },
    });
  }

  await client.query(
    `INSERT INTO public.issue_resolutions
       (issue_id, outcome, note, resolved_at, resolved_by_account_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [issueId, body.outcome, body.note, body.resolvedAt, resolverAccountId]
  );

  // Pindahkan status issue ke resolved dan simpan catatan resolusi di kolom notes.
  await client.query(
    `UPDATE public.transaction_issues
     SET status = 'resolved', notes = $2, updated_at = CURRENT_TIMESTAMP
     WHERE issue_id = $1`,
    [issueId, body.note]
  );

  // Kembalikan issue lengkap dengan resolusi.
  const result = await client.query(
    `SELECT ${columns} ${fromClause} WHERE i.issue_id = $1`,
    [issueId]
  );

  return result.rows[0];
}

module.exports = { getIssueById, listIssues, createIssue, createIssueResolution };
