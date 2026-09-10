/**
 * Pengujian POST + Idempotency Replay untuk deployment cloud (Vercel + Neon)
 * Route yang diimplementasikan service:
 *   - GET  /health
 *   - GET  /v1/requests
 *   - GET  /v1/requests/:requestId
 *   - POST /v1/requests/:requestId/assignments  (+ idempotency)
 *   - GET  /v1/assignments/:assignmentId
 *
 * Jalankan: node tests/cloud-post-test.mjs
 */

const base = 'https://titipin-nine.vercel.app';

// UUID v4 yang valid untuk Idempotency-Key
// Gunakan req_01_open yang statusnya 'open' dan belum punya assignment di seed
const IDEMPOTENCY_KEY_1 = 'a1b2c3d4-e5f6-4789-8012-aabbccddeef1';
const IDEMPOTENCY_KEY_2 = 'b2c3d4e5-f6a7-4890-9123-bbccddeeff22';

async function req(method, path, body, headers = {}) {
  const url = `${base}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, headers: Object.fromEntries(res.headers), json };
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    process.exitCode = 1;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== LANGKAH 1: POST /v1/requests/req_01_open/assignments (buat assignment) ===');
console.log(`  Idempotency-Key: ${IDEMPOTENCY_KEY_1}`);
let firstStatus = null;
let firstBody = null;
{
  const r = await req(
    'POST',
    '/v1/requests/req_01_open/assignments',
    { offerId: 'off_01_active_javier' },
    { 'Idempotency-Key': IDEMPOTENCY_KEY_1 }
  );

  firstStatus = r.status;
  firstBody = r.json;
  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${JSON.stringify(r.json)}`);
  assert('Status 201 Created', r.status === 201, JSON.stringify(r.json));
  if (r.json?.assignmentId) {
    console.log(`  → assignmentId: ${r.json.assignmentId}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== LANGKAH 2: REPLAY POST dengan key yang SAMA (idempotency) ===');
console.log(`  Idempotency-Key: ${IDEMPOTENCY_KEY_1}`);
{
  const r = await req(
    'POST',
    '/v1/requests/req_01_open/assignments',
    { offerId: 'off_01_active_javier' },
    { 'Idempotency-Key': IDEMPOTENCY_KEY_1 }
  );

  console.log(`  Status: ${r.status}`);
  console.log(`  Body: ${JSON.stringify(r.json)}`);

  // Idempotent replay harus mengembalikan respons yang sama seperti pertama
  assert(
    'Status sama dengan permintaan pertama (idempotent)',
    r.status === firstStatus,
    `expected ${firstStatus}, got ${r.status}`
  );
  assert(
    'assignmentId sama dengan permintaan pertama',
    r.json?.assignmentId === firstBody?.assignmentId,
    `expected ${firstBody?.assignmentId}, got ${r.json?.assignmentId}`
  );
  console.log(`  → assignmentId (replay): ${r.json?.assignmentId}`);
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== LANGKAH 3: GET assignment yang baru dibuat ===');
if (firstBody?.assignmentId) {
  const r = await req('GET', `/v1/assignments/${firstBody.assignmentId}`);
  console.log(`  Status: ${r.status}`);
  assert('GET assignment → 200', r.status === 200, JSON.stringify(r.json));
  if (r.json) {
    console.log(`  → requestId: ${r.json.requestId}`);
    console.log(`  → offerId: ${r.json.offerId}`);
    console.log(`  → status: ${r.json.status}`);
    console.log(`  → assignedJastiperId: ${r.json.assignedJastiperId}`);
  }
} else {
  console.log('  ⏭ Langkah dilewati karena assignmentId tidak diperoleh di langkah 1.');
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== LANGKAH 4: GET assignment dari seed (asg_02_transit) ===');
{
  const r = await req('GET', '/v1/assignments/asg_02_transit');
  console.log(`  Status: ${r.status}`);
  assert('GET /v1/assignments/asg_02_transit → 200', r.status === 200, JSON.stringify(r.json));
  if (r.json) {
    console.log(`  → status: ${r.json.status}`);
    console.log(`  → assignedJastiperId: ${r.json.assignedJastiperId}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n=== LANGKAH 5: Verifikasi persistensi data seed req_03_completed ===');
{
  const r = await req('GET', '/v1/requests/req_03_completed');
  console.log(`  Status: ${r.status}`);
  assert('GET req_03_completed → 200', r.status === 200, JSON.stringify(r.json));
  if (r.json) {
    console.log(`  → status: ${r.json.status}`);
    console.log(`  → selectedOfferId: ${r.json.selectedOfferId}`);
  }
}

console.log('\n=== Pengujian cloud selesai. ===\n');
