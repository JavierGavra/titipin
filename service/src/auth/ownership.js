'use strict';

function isRequester(actor, row) {
  return actor.kind === 'user' && actor.role === 'requester'
    && actor.accountId === row.requester_id;
}

function isAssignedJastiper(actor, row) {
  return actor.kind === 'user' && actor.role === 'jastiper'
    && actor.verificationStatus === 'verified'
    && actor.accountId === row.assigned_jastiper_id;
}

function isOperationalReader(actor, row) {
  return row.operational_access === true && (
    (actor.kind === 'user' && actor.role === 'admin')
    || (actor.kind === 'service' && actor.roles.includes('mcp-reader'))
  );
}

function mayReadRequest(actor, row) {
  return Boolean(row) && (isRequester(actor, row) || isAssignedJastiper(actor, row)
    || isOperationalReader(actor, row)
    || (actor.kind === 'user' && actor.role === 'jastiper'
      && actor.verificationStatus === 'verified' && row.status === 'open'
      && row.assigned_jastiper_id === null && row.deadline > new Date()));
}

function mayReadAssignment(actor, row) {
  return Boolean(row) && (isRequester(actor, row) || isAssignedJastiper(actor, row)
    || isOperationalReader(actor, row));
}

function maySelectOffer(actor, row) {
  return Boolean(row) && isRequester(actor, row);
}

function mayWriteLocation(actor, row) {
  return Boolean(row) && (isAssignedJastiper(actor, row)
    || (actor.kind === 'tracker' && actor.role === 'jastiper'
      && actor.verificationStatus === 'verified' && row.tracker_access === true
      && actor.accountId === row.assigned_jastiper_id));
}

function maySeeRequestPrivateFields(actor, row) {
  return isRequester(actor, row) || isAssignedJastiper(actor, row)
    || (actor.kind === 'user' && actor.role === 'admin' && row.operational_access === true);
}

function mayCreateRequest(actor) {
  return actor.kind === 'user' && actor.role === 'requester'
    && actor.accountId !== null;
}

function mayReadOffer(actor) {
  return actor.accountId !== null && (
    (actor.kind === 'user' && ['requester', 'jastiper', 'admin'].includes(actor.role))
    || (actor.kind === 'service' && actor.roles.includes('mcp-reader'))
  );
}

function mayCreateOffer(actor) {
  return actor.kind === 'user' && actor.role === 'jastiper'
    && actor.verificationStatus === 'verified'
    && actor.accountId !== null;
}

function mayCreatePayment(actor, assignmentRow) {
  return Boolean(assignmentRow) && actor.kind === 'user' && actor.role === 'requester'
    && actor.accountId !== null;
}

function mayReadPayment(actor, row) {
  if (!row) return false;
  if (actor.kind === 'user' && actor.role === 'requester' && actor.accountId !== null) return true;
  if (actor.kind === 'user' && actor.role === 'jastiper'
      && actor.verificationStatus === 'verified'
      && actor.accountId === row.assigned_jastiper_id) return true;
  if (actor.kind === 'user' && actor.role === 'admin' && actor.accountId !== null) return true;
  return false;
}

function mayCreateDelivery(actor, assignmentRow) {
  return Boolean(assignmentRow) && actor.kind === 'user' && actor.role === 'jastiper'
    && actor.verificationStatus === 'verified'
    && actor.accountId === assignmentRow.assigned_jastiper_id;
}

function mayReadDelivery(actor, row) {
  if (!row) return false;
  if (actor.kind === 'user' && actor.role === 'requester'
      && actor.accountId === row.requester_id) return true;
  if (actor.kind === 'user' && actor.role === 'jastiper'
      && actor.verificationStatus === 'verified'
      && actor.accountId === row.assigned_jastiper_id) return true;
  if (actor.kind === 'user' && actor.role === 'admin'
      && actor.accountId !== null) return true;
  return false;
}

function mayCreateReceiptConfirmation(actor, deliveryRow) {
  return Boolean(deliveryRow) && actor.kind === 'user' && actor.role === 'requester'
    && actor.accountId === deliveryRow.requester_id;
}

function mayReadReceiptConfirmation(actor, row) {
  if (!row) return false;
  if (actor.kind === 'user' && actor.role === 'requester'
      && actor.accountId === row.requester_id) return true;
  if (actor.kind === 'user' && actor.role === 'jastiper'
      && actor.verificationStatus === 'verified'
      && actor.accountId === row.assigned_jastiper_id) return true;
  if (actor.kind === 'user' && actor.role === 'admin'
      && actor.accountId !== null) return true;
  return false;
}

// Semua aktor terautentikasi dengan role yang diizinkan dapat membaca akun manapun.
// Spec tidak mendefinisikan batasan kepemilikan pada getAccount.
function mayReadAccount(actor, row) {
  if (!row) return false;
  return actor.accountId !== null && actor.kind === 'user'
    && ['requester', 'jastiper', 'admin'].includes(actor.role);
}

module.exports = {
  mayReadRequest, mayReadAssignment, maySelectOffer, mayWriteLocation,
  maySeeRequestPrivateFields, mayCreateRequest,
  mayReadOffer, mayCreateOffer,
  mayCreatePayment, mayReadPayment,
  mayCreateDelivery, mayReadDelivery,
  mayCreateReceiptConfirmation, mayReadReceiptConfirmation,
  mayReadAccount,
};

