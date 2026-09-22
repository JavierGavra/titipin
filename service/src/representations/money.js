'use strict';

// node-postgres membaca kolom NUMERIC sebagai string.
// Fungsi ini mengonversinya ke integer JavaScript yang aman,
// atau ke JSON.rawJSON untuk nilai di luar rentang Number.MAX_SAFE_INTEGER.
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

module.exports = { toMoneyAmount };
