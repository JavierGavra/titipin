'use strict';

// Spec Account mendefinisikan 6 required field yang sama untuk semua role yang
// diizinkan (requester, jastiper, admin). Field filtering lintas-role diterapkan
// di ownership gate — jika aktor tidak berhak membaca akun tersebut, handler
// mengembalikan 404 sebelum fungsi ini dipanggil.
function toAccount(row) {
  return {
    accountId: row.account_id,
    displayName: row.display_name,
    role: row.role,
    verificationStatus: row.verification_status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

module.exports = { toAccount };
