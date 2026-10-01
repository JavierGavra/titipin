import * as api from './api.js';
import * as auth from './auth.js';

const app = document.querySelector('#app');
let pollTimer = null;
let renderToken = 0;
let activeContext = {};
let dashboardSnapshot = null;

api.configureApi({
  getAccessToken: auth.accessToken,
  refreshSession: auth.refreshSession,
  onSessionExpired: () => {
    if (!window.location.pathname.startsWith('/signin')) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      navigate(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
    }
  },
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function formatMoney(money) {
  if (!money) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: money.currency || 'IDR', maximumFractionDigits: 0 }).format(money.amount || 0);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '-' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isoFromInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function statusLabel(value) {
  return ({ open: 'Terbuka', assigned: 'Ditugaskan', completed: 'Selesai', expired: 'Kedaluwarsa', cancelled: 'Dibatalkan', unavailable: 'Tidak tersedia', active: 'Aktif', purchased: 'Sudah dibeli', pending: 'Menunggu', in_transit: 'Dalam perjalanan', delivered: 'Terkirim', confirmed: 'Dikonfirmasi', unavailable: 'Tidak tersedia', resolved: 'Selesai', in_review: 'Ditinjau' })[value] || value || '-';
}

function badge(value) {
  const warn = ['unavailable', 'expired', 'cancelled', 'in_review'].includes(value) ? ' warn' : '';
  return `<span class="badge${warn}">${escapeHtml(statusLabel(value))}</span>`;
}

function skeletons(count = 3) {
  return `<div class="skeleton-list">${Array.from({ length: count }, () => '<div class="skeleton" aria-hidden="true"></div>').join('')}</div>`;
}

function stateError(problem, retryAction = '') {
  const retry = retryAction ? `<button class="btn btn-secondary" data-action="${retryAction}">Coba lagi</button>` : '';
  return `<section class="state state-error" role="alert"><div><h2>${escapeHtml(problem?.title || 'Permintaan gagal')}</h2><p>${escapeHtml(problem?.detail || 'Layanan belum dapat menyelesaikan permintaan ini.')}</p></div>${retry}</section>`;
}

function stateEmpty(title, detail) {
  return `<section class="state"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></div></section>`;
}

function notFoundState() {
  return `<section class="state"><div><h2>Data tidak ditemukan</h2><p>Data ini tidak tersedia atau tidak dapat ditampilkan untuk akun yang sedang masuk.</p></div><a class="btn btn-secondary" href="/dashboard" data-nav>Kembali ke beranda</a></section>`;
}

function shell(content, title = 'Titipin') {
  const session = auth.getSession();
  const role = session?.user?.role;
  const nav = session ? `<nav class="nav" aria-label="Navigasi utama">
    <a href="/dashboard" data-nav>Beranda</a>
    ${role === 'requester' ? '<a href="/requests/new" data-nav>Buat permintaan</a>' : ''}
    ${role === 'admin' ? '<a href="/issues" data-nav>Laporan kendala</a>' : ''}
  </nav>` : '';
  const identity = session ? `<div class="identity"><span class="avatar">${escapeHtml((session.user.name || role || '?').slice(0, 1).toUpperCase())}</span><span>${escapeHtml(session.user.name || auth.roleLabel(role))}</span><button class="btn btn-secondary btn-small" data-action="signout">Keluar</button></div>` : '';
  return `<header class="topbar"><a class="brand" href="/" data-nav><span class="brand-mark">T</span><span>${escapeHtml(title)}</span></a>${nav}${identity}</header><main class="container">${content}</main>`;
}

function pageHeading(title, detail, action = '') {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></div>${action}</div>`;
}

function navigate(path) {
  if (window.location.pathname + window.location.search === path) { renderRoute(); return; }
  window.history.pushState({}, '', path);
  renderRoute();
}

function protectedPath(pathname) {
  return pathname === '/dashboard' || pathname === '/requests/new' || pathname === '/issues'
    || /^\/(requests|assignments|deliveries|issues)\/[^/]+/.test(pathname);
}

function signinView(errorMessage = '') {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('returnTo') || '/dashboard';
  const message = errorMessage ? `<div class="form-error" role="alert">${escapeHtml(errorMessage)}</div>` : '';
  app.innerHTML = shell(`<section class="auth-card card"><div class="brand"><span class="brand-mark">T</span><span>Titipin</span></div><h1>Masuk untuk melanjutkan</h1><p>Gunakan akun Titipin sesuai peran requester, jastiper, atau admin. Login memakai Authorization Code + PKCE.</p>${message}<button class="btn btn-primary" data-action="login" data-return-to="${escapeHtml(returnTo)}">Masuk dengan akun Titipin</button><p class="footer-note">Tidak ada data transaksi yang disimpan di halaman ini. Semua aturan tetap diperiksa oleh service.</p></section>`);
}

async function renderDashboard() {
  const token = ++renderToken;
  clearInterval(pollTimer);
  activeContext = {};
  const session = await auth.ensureFreshSession();
  if (!session) return navigate(`/signin?returnTo=${encodeURIComponent('/dashboard')}`);
  const role = session.user.role;
  const title = role === 'jastiper' ? 'Permintaan terbuka' : role === 'admin' ? 'Laporan kendala' : 'Permintaan saya';
  const detail = role === 'jastiper' ? 'Pilih permintaan yang dapat kamu penuhi dan ajukan penawaran.' : role === 'admin' ? 'Pantau kendala transaksi dan tindak lanjuti kasus yang terbuka.' : 'Pantau permintaan belanja lokal dari satu tempat.';
  app.innerHTML = shell(`${pageHeading(title, detail, role === 'requester' ? '<a class="btn btn-primary" href="/requests/new" data-nav>Buat permintaan</a>' : '')}${skeletons(3)}`);
  try {
    const result = role === 'admin' ? await api.listIssues({ conditional: true }) : await api.listRequests({ conditional: true });
    if (token !== renderToken) return;
    dashboardSnapshot = { role, result, stale: false };
    renderDashboardContent();
    pollTimer = setInterval(() => refreshDashboard(token), 15_000);
  } catch (problem) {
    if (token !== renderToken) return;
    dashboardSnapshot = null;
    app.innerHTML = shell(`${pageHeading(title, detail)}${stateError(problem, 'retry-dashboard')}`);
  }
}

function renderDashboardContent() {
  if (!dashboardSnapshot) return;
  const { role, result, stale } = dashboardSnapshot;
  const data = result.data || { items: [] };
  const fetched = result.fetchedAt ? `Data diperbarui ${formatDate(result.fetchedAt)}` : 'Data terbaru';
  const staleBanner = stale ? `<div class="stale"><span>Menampilkan data terakhir yang berhasil dimuat (${escapeHtml(fetched)}). Sinkronisasi berikutnya gagal.</span><button class="btn btn-secondary btn-small" data-action="retry-dashboard">Coba lagi</button></div>` : '';
  const title = role === 'jastiper' ? 'Permintaan terbuka' : role === 'admin' ? 'Laporan kendala' : 'Permintaan saya';
  const detail = role === 'jastiper' ? 'Pilih permintaan yang dapat kamu penuhi dan ajukan penawaran.' : role === 'admin' ? 'Pantau kendala transaksi dan tindak lanjuti kasus yang terbuka.' : 'Pantau permintaan belanja lokal dari satu tempat.';
  let body;
  if (!data.items?.length) {
    body = stateEmpty(role === 'admin' ? 'Belum ada laporan kendala.' : role === 'jastiper' ? 'Belum ada permintaan terbuka.' : 'Belum ada permintaan.', role === 'requester' ? 'Buat permintaan pertama untuk mulai menggunakan Titipin.' : 'Periksa kembali beberapa saat lagi.');
  } else if (role === 'admin') {
    body = `<div class="table-wrap"><table><thead><tr><th>Status</th><th>Kategori</th><th>Deskripsi</th><th>Dibuat</th><th></th></tr></thead><tbody>${data.items.map((issue) => `<tr><td>${badge(issue.status)}</td><td>${escapeHtml(issue.category)}</td><td>${escapeHtml(issue.description)}</td><td>${escapeHtml(formatDate(issue.createdAt))}</td><td><a class="btn btn-secondary btn-small" href="/issues/${encodeURIComponent(issue.issueId)}" data-nav>Lihat</a></td></tr>`).join('')}</tbody></table></div>`;
  } else {
    body = `<div class="card-grid">${data.items.map((item) => {
      const asgId = item.assignmentId || localStorage.getItem('titipin.asg.' + item.requestId);
      return `<a class="card card-link" href="/requests/${encodeURIComponent(item.requestId)}" data-nav>
        <div class="actions" style="justify-content:space-between">
          <span class="badge">${escapeHtml(item.requestId)}</span>
          <div style="display:flex;gap:0.4rem;align-items:center;">
            ${asgId ? `<span class="badge" style="background:#e0f2fe;color:#0369a1;">Penugasan Ada</span>` : ''}
            ${badge(item.status)}
          </div>
        </div>
        <h2>${escapeHtml(item.itemDescription)}</h2>
        <p>${escapeHtml(item.quantity)} unit · ${escapeHtml(item.targetStoreOrArea)}</p>
        <dl class="metric"><dt>Anggaran</dt><dd>${formatMoney(item.budget)}</dd></dl>
        <dl class="metric"><dt>Batas waktu</dt><dd>${escapeHtml(formatDate(item.deadline))}</dd></dl>
      </a>`;
    }).join('')}</div>`;
  }
  app.innerHTML = shell(`${pageHeading(title, detail, role === 'requester' ? '<a class="btn btn-primary" href="/requests/new" data-nav>Buat permintaan</a>' : '')}${staleBanner}${body}<p class="footer-note">${escapeHtml(fetched)} · Daftar diperbarui otomatis setiap 15 detik.</p>`);
}

async function refreshDashboard(token) {
  if (token !== renderToken || !dashboardSnapshot) return;
  try {
    await auth.ensureFreshSession();
    const result = dashboardSnapshot.role === 'admin'
      ? await api.listIssues({ conditional: true })
      : await api.listRequests({ conditional: true });
    if (token !== renderToken) return;
    dashboardSnapshot = { ...dashboardSnapshot, result, stale: false };
    renderDashboardContent();
  } catch {
    dashboardSnapshot = { ...dashboardSnapshot, stale: true };
    renderDashboardContent();
  }
}

function renderRequestForm() {
  clearInterval(pollTimer);
  ++renderToken;
  activeContext = {};
  const defaultDeadline = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  app.innerHTML = shell(`${pageHeading('Buat permintaan', 'Jelaskan barang yang ingin dibeli dan tujuan pengantarannya.')}<section class="card form-card"><form id="request-form" novalidate><div class="form-grid"><div class="field full" data-field="itemDescription"><label for="itemDescription">Nama atau deskripsi barang</label><textarea id="itemDescription" name="itemDescription" required maxlength="500"></textarea><small>Contoh: Buku catatan penelitian hardcover A5.</small><div class="field-error"></div></div><div class="field" data-field="quantity"><label for="quantity">Jumlah</label><input id="quantity" name="quantity" type="number" min="1" max="99" value="1" required><div class="field-error"></div></div><div class="field" data-field="budgetAmount"><label for="budgetAmount">Anggaran (IDR)</label><input id="budgetAmount" name="budgetAmount" type="number" min="0" step="1" required><div class="field-error"></div></div><div class="field full" data-field="targetStoreOrArea"><label for="targetStoreOrArea">Toko atau area tujuan</label><input id="targetStoreOrArea" name="targetStoreOrArea" maxlength="300" required><div class="field-error"></div></div><div class="field full" data-field="deliveryAddress"><label for="deliveryAddress">Alamat pengantaran</label><textarea id="deliveryAddress" name="deliveryAddress" maxlength="500" required></textarea><div class="field-error"></div></div><div class="field full" data-field="deadline"><label for="deadline">Batas waktu</label><input id="deadline" name="deadline" type="datetime-local" value="${defaultDeadline}" required><small>Waktu harus berada di masa depan.</small><div class="field-error"></div></div></div><div class="actions" style="justify-content:flex-end;margin-top:1.25rem"><a class="btn btn-secondary" href="/dashboard" data-nav>Batal</a><button class="btn btn-primary" type="submit">Kirim permintaan</button></div></form></section>`);
}

function setFormErrors(form, problem) {
  form.querySelectorAll('.field').forEach((field) => { field.classList.remove('invalid'); field.querySelector('.field-error').textContent = ''; });
  const params = problem?.invalidParams || [];
  for (const item of params) {
    const fieldName = item.name === 'budget.amount' ? 'budgetAmount' : item.name;
    const field = form.querySelector(`[data-field="${CSS.escape(fieldName)}"]`);
    if (field) { field.classList.add('invalid'); field.querySelector('.field-error').textContent = item.reason || 'Nilai belum valid.'; }
  }
  const global = form.querySelector('.form-error');
  if (global) global.textContent = params.length ? '' : (problem?.detail || 'Periksa kembali isian formulir.');
  else if (!params.length) form.insertAdjacentHTML('afterbegin', `<div class="form-error" role="alert">${escapeHtml(problem?.detail || 'Periksa kembali isian formulir.')}</div>`);
}

function validateRequired(form, fields) {
  const invalid = [];
  for (const [name, message] of fields) {
    const input = form.elements[name];
    if (!input || !String(input.value).trim()) invalid.push({ name, reason: message });
  }
  if (invalid.length) setFormErrors(form, new api.ProblemError({ status: 400, invalidParams: invalid, detail: 'Lengkapi kolom yang ditandai.' }));
  return invalid.length === 0;
}

async function renderRequestDetail(requestId, notice = '') {
  const token = ++renderToken;
  clearInterval(pollTimer);
  activeContext = {};
  app.innerHTML = shell(`${pageHeading('Detail permintaan', 'Memuat data permintaan dan penawaran...')}${skeletons(3)}`);
  try {
    const [requestResult, offersResult] = await Promise.all([api.getRequest(requestId), api.listOffers(requestId)]);
    if (token !== renderToken) return;
    const request = requestResult.data;
    activeContext = { request, requestEtag: requestResult.etag };
    renderRequestDetailContent(requestId, request, offersResult.data, notice);
  } catch (problem) {
    if (token !== renderToken) return;
    app.innerHTML = shell(`${pageHeading('Detail permintaan', 'Data permintaan')}${problem.status === 404 ? notFoundState() : stateError(problem, 'retry-request')}`);
  }
}

function renderRequestDetailContent(requestId, request, offersPage, notice = '') {
  const session = auth.getSession();
  const role = session?.user?.role;
  const offers = offersPage?.items || [];
  const knownAssignmentId = request.assignmentId || localStorage.getItem('titipin.asg.' + requestId) || null;
  const offerSection = offers.length ? `<div class="stack">${offers.map((offer) => `<article class="offer"><div><h3>${formatMoney(offer.totalAmount)} · ${badge(offer.status)}</h3><p>Harga barang ${formatMoney(offer.itemPrice)} · Jasa ${formatMoney(offer.serviceFee)} · Antar ${formatMoney(offer.deliveryFee)}</p><p>${escapeHtml(offer.note || 'Tidak ada catatan tambahan.')} · tiba ${escapeHtml(formatDate(offer.estimatedArrivalAt))}</p></div>${role === 'requester' && request.status === 'open' && offer.status === 'active' ? `<button class="btn btn-primary btn-small" data-action="select-offer" data-offer-id="${escapeHtml(offer.offerId)}">Pilih penawaran</button>` : ''}</article>`).join('')}</div>` : stateEmpty('Belum ada penawaran.', role === 'jastiper' ? 'Jadilah penawar pertama untuk permintaan ini.' : 'Jastiper akan melihat permintaan ini dan mengirimkan penawaran.');
  const offerForm = role === 'jastiper' && request.status === 'open' ? `<section class="card"><h2>Ajukan penawaran</h2><p>Semua nominal adalah IDR. Service akan memvalidasi kembali data ini.</p><form id="offer-form" novalidate><div class="form-grid"><div class="field" data-field="itemPrice"><label>Harga barang</label><input name="itemPrice" type="number" min="0" required><div class="field-error"></div></div><div class="field" data-field="serviceFee"><label>Biaya jasa</label><input name="serviceFee" type="number" min="0" required><div class="field-error"></div></div><div class="field" data-field="deliveryFee"><label>Biaya antar</label><input name="deliveryFee" type="number" min="0" required><div class="field-error"></div></div><div class="field" data-field="estimatedArrivalAt"><label>Perkiraan tiba</label><input name="estimatedArrivalAt" type="datetime-local" required><div class="field-error"></div></div><div class="field" data-field="stockCheckedAt"><label>Stok dicek pada</label><input name="stockCheckedAt" type="datetime-local" required><div class="field-error"></div></div><div class="field" data-field="expiresAt"><label>Penawaran berlaku sampai</label><input name="expiresAt" type="datetime-local" required><div class="field-error"></div></div><div class="field full" data-field="note"><label>Catatan (opsional)</label><textarea name="note" maxlength="500"></textarea><div class="field-error"></div></div></div><button class="btn btn-primary" type="submit">Kirim penawaran</button></form></section>` : '';
  const noticeHtml = notice ? `<div class="stale" role="status"><span>${escapeHtml(notice)}</span><button class="btn btn-secondary btn-small" data-action="reload-request">Muat ulang</button></div>` : '';

  let actionBanner = '';
  if (request.status === 'assigned') {
    if (role === 'requester') {
      actionBanner = `<div class="stale" style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;" role="status">
        <div><strong>Penawaran Telah Dipilih!</strong><p style="margin:0.25rem 0 0 0;">Lanjutkan ke tahap pembayaran pesanan agar Jastiper dapat segera membelikan pesanan Anda.</p></div>
        ${knownAssignmentId ? `<a class="btn btn-primary btn-small" href="/assignments/${encodeURIComponent(knownAssignmentId)}" data-nav>Bayar Pesanan Sekarang</a>` : ''}
      </div>`;
    } else if (role === 'jastiper') {
      actionBanner = `<div class="stale" style="background:#f0fdf4;border:1px solid #86efac;color:#166534;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;" role="status">
        <div><strong>Penawaran Anda Telah Dipilih!</strong><p style="margin:0.25rem 0 0 0;">Pemesan telah menyetujui tawaran Anda. Buka halaman penugasan untuk memantau pembayaran dan mulai pengantaran.</p></div>
        ${knownAssignmentId ? `<a class="btn btn-primary btn-small" href="/assignments/${encodeURIComponent(knownAssignmentId)}" data-nav>Buka Halaman Penugasan</a>` : ''}
      </div>`;
    }
  } else if (request.status === 'completed') {
    actionBanner = `<div class="stale" style="background:#f0fdf4;border:1px solid #86efac;color:#166534;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;" role="status">
      <div><strong>Transaksi Selesai</strong><p style="margin:0.25rem 0 0 0;">Barang belanjaan telah berhasil diantar dan diterima oleh pemesan.</p></div>
      ${knownAssignmentId ? `<a class="btn btn-secondary btn-small" href="/assignments/${encodeURIComponent(knownAssignmentId)}" data-nav>Lihat Penugasan</a>` : ''}
    </div>`;
  }

  app.innerHTML = shell(`${pageHeading('Detail permintaan', request.itemDescription, '<a class="btn btn-secondary" href="/dashboard" data-nav>Kembali</a>')}${noticeHtml}${actionBanner}<div class="detail-layout"><div class="stack"><section class="card"><div class="actions" style="justify-content:space-between"><span class="badge">${escapeHtml(request.requestId)}</span><div style="display:flex;gap:0.5rem;align-items:center;">${knownAssignmentId ? `<a href="/assignments/${encodeURIComponent(knownAssignmentId)}" class="btn btn-primary btn-small" data-nav>Buka Penugasan</a>` : ''}${badge(request.status)}</div></div><h2>${escapeHtml(request.itemDescription)}</h2><p>${escapeHtml(request.quantity)} unit untuk ${escapeHtml(request.targetStoreOrArea)}</p><dl class="metric"><dt>Anggaran</dt><dd>${formatMoney(request.budget)}</dd></dl><dl class="metric"><dt>Batas waktu</dt><dd>${escapeHtml(formatDate(request.deadline))}</dd></dl>${request.deliveryAddress ? `<dl class="metric"><dt>Alamat pengantaran</dt><dd>${escapeHtml(request.deliveryAddress)}</dd></dl>` : ''}${request.requesterId ? `<dl class="metric"><dt>Pemesan (Internal)</dt><dd>${escapeHtml(request.requesterId)}</dd></dl>` : ''}${request.assignedJastiperId ? `<dl class="metric"><dt>Jastiper (Internal)</dt><dd>${escapeHtml(request.assignedJastiperId)}</dd></dl>` : ''}</section><section class="card"><h2>Penawaran</h2>${offerSection}</section>${offerForm}</div><aside class="stack"><section class="card"><h2>Alur transaksi</h2><div class="timeline"><div class="timeline-item"><strong>Permintaan dibuat</strong><span>${escapeHtml(formatDate(request.createdAt))}</span></div><div class="timeline-item"><strong>Status ${escapeHtml(statusLabel(request.status))}</strong><span>Pembaruan terakhir ${escapeHtml(formatDate(request.updatedAt))}</span></div></div></section><section class="card"><h2>Perlindungan transaksi</h2><p>Setiap tindakan mengirim idempotency key. Perubahan bersamaan memakai ETag agar data rekan kerja tidak tertimpa.</p></section></aside></div>`);
}

async function renderAssignmentDetail(assignmentId, notice = '') {
  const token = ++renderToken;
  clearInterval(pollTimer);
  activeContext = {};
  app.innerHTML = shell(`${pageHeading('Detail penugasan', 'Memuat status penugasan...')}${skeletons(2)}`);
  try {
    const result = await api.getAssignment(assignmentId);
    if (token !== renderToken) return;
    activeContext = { assignment: result.data, assignmentEtag: result.etag };
    const role = auth.getSession()?.user?.role;
    const assignment = result.data;
    if (assignment.requestId) {
      try { localStorage.setItem('titipin.asg.' + assignment.requestId, assignment.assignmentId); } catch {}
    }
    const paymentForm = role === 'requester' && ['active', 'assigned'].includes(assignment.status) ? `<section class="card"><h2>Bayar pesanan</h2><p>Pilih simulasi pembayaran. Nominal final dihitung service dari penawaran.</p><form id="payment-form"><div class="field"><label for="paymentMethod">Metode</label><select id="paymentMethod" name="method"><option value="simulated_bank_transfer">Transfer bank simulasi</option><option value="simulated_card">Kartu simulasi</option></select></div><button class="btn btn-primary" type="submit">Bayar sekarang</button></form></section>` : '';
    const requesterPaidCard = role === 'requester' && assignment.status === 'purchased' ? `<section class="card" style="background:#f0fdf4;border:1px solid #86efac;"><h2 style="color:#166534;">Pembayaran Berhasil</h2><p>Pembayaran pesanan telah dikonfirmasi (status: <strong>purchased</strong>). Saat ini menunggu jastiper membeli barang dan memulai pengantaran.</p></section>` : '';
    const deliveryForm = role === 'jastiper' && ['active', 'purchased'].includes(assignment.status) ? (assignment.status === 'active' ? `<section class="card"><h2>Menunggu Pembayaran</h2><p>Pemesan belum menyelesaikan pembayaran. Anda baru bisa memulai pengantaran setelah status menjadi purchased.</p></section>` : `<section class="card"><h2>Mulai pengantaran</h2><p>Catat waktu barang dibeli sebelum membuat delivery.</p><form id="delivery-form"><div class="field" data-field="purchaseRecordedAt"><label for="purchaseRecordedAt">Waktu pembelian</label><input id="purchaseRecordedAt" name="purchaseRecordedAt" type="datetime-local" required><div class="field-error"></div></div><button class="btn btn-primary" type="submit">Buat delivery</button></form></section>`) : '';
    const noticeHtml = notice ? `<div class="stale" role="status"><span>${escapeHtml(notice)}</span><button class="btn btn-secondary btn-small" data-action="reload-assignment">Muat ulang</button></div>` : '';
    app.innerHTML = shell(`${pageHeading('Detail penugasan', `Penugasan ${assignment.assignmentId}`, '<a class="btn btn-secondary" href="/dashboard" data-nav>Kembali</a>')}${noticeHtml}<div class="detail-layout"><div class="stack"><section class="card"><div class="actions" style="justify-content:space-between"><span class="badge">${escapeHtml(assignment.assignmentId)}</span>${badge(assignment.status)}</div><dl class="metric"><dt>Request</dt><dd><a href="/requests/${encodeURIComponent(assignment.requestId)}" data-nav>${escapeHtml(assignment.requestId)}</a></dd></dl><dl class="metric"><dt>Offer</dt><dd>${escapeHtml(assignment.offerId)}</dd></dl><dl class="metric"><dt>Jastiper</dt><dd>${escapeHtml(assignment.assignedJastiperId)}</dd></dl><dl class="metric"><dt>Diperbarui</dt><dd>${escapeHtml(formatDate(assignment.updatedAt))}</dd></dl></section>${paymentForm}${requesterPaidCard}${deliveryForm}</div><aside class="stack"><section class="card"><h2>Catatan</h2><p>Status penugasan dibaca dari service. Refresh halaman tetap memuat data yang sama dari URL ini.</p></section></aside></div>`);
  } catch (problem) {
    if (token !== renderToken) return;
    if (problem.status === 404) {
      app.innerHTML = shell(`${pageHeading('Detail penugasan', 'Data penugasan')}<section class="card empty"><div class="empty-icon" aria-hidden="true"></div><h2>Data tidak ditemukan atau belum memiliki izin</h2><p>${escapeHtml(problem.detail || 'Data ini tidak tersedia atau tidak dapat ditampilkan untuk akun yang sedang masuk.')}</p><div class="actions"><button class="btn btn-primary" data-action="retry-assignment">Coba lagi</button><a class="btn btn-secondary" href="/dashboard" data-nav>Kembali ke beranda</a></div></section>`);
    } else {
      app.innerHTML = shell(`${pageHeading('Detail penugasan', 'Data penugasan')}${stateError(problem, 'retry-assignment')}`);
    }
  }
}

async function renderDeliveryDetail(deliveryId) {
  const token = ++renderToken;
  clearInterval(pollTimer);
  activeContext = {};
  app.innerHTML = shell(`${pageHeading('Detail pengantaran', 'Memuat status dan histori lokasi...')}${skeletons(2)}`);
  try {
    const [deliveryResult, locationsResult] = await Promise.all([api.getDelivery(deliveryId), api.listLocations(deliveryId)]);
    if (token !== renderToken) return;
    activeContext = { delivery: deliveryResult.data, deliveryEtag: deliveryResult.etag };
    const delivery = deliveryResult.data;
    const role = auth.getSession()?.user?.role;
    const locations = locationsResult.data?.items || [];
    const locationForm = role === 'jastiper' ? `<section class="card"><h2>Kirim lokasi terbaru</h2><form id="location-form"><div class="form-grid"><div class="field" data-field="latitude"><label>Latitude</label><input name="latitude" type="number" step="any" min="-90" max="90" required><div class="field-error"></div></div><div class="field" data-field="longitude"><label>Longitude</label><input name="longitude" type="number" step="any" min="-180" max="180" required><div class="field-error"></div></div></div><button class="btn btn-primary" type="submit">Simpan lokasi</button></form></section>` : '';
    const receiptForm = role === 'requester' && ['delivered', 'in_transit', 'pending'].includes(delivery.status) ? `<section class="card"><h2>Konfirmasi penerimaan</h2><p>Konfirmasi setelah paket diterima.</p><form id="receipt-form"><div class="form-grid"><div class="field" data-field="recipientName"><label>Nama penerima</label><input name="recipientName" required><div class="field-error"></div></div><div class="field full" data-field="note"><label>Catatan</label><textarea name="note" maxlength="500"></textarea><div class="field-error"></div></div></div><button class="btn btn-primary" type="submit">Konfirmasi diterima</button></form></section>` : '';
    app.innerHTML = shell(`${pageHeading('Detail pengantaran', `Delivery ${delivery.deliveryId}`, '<a class="btn btn-secondary" href="/dashboard" data-nav>Kembali</a>')}<div class="detail-layout"><div class="stack"><section class="card"><div class="actions" style="justify-content:space-between"><span class="badge">${escapeHtml(delivery.deliveryId)}</span>${badge(delivery.status)}</div><dl class="metric"><dt>Alamat</dt><dd>${escapeHtml(delivery.deliveryAddress)}</dd></dl><dl class="metric"><dt>Dibuat</dt><dd>${escapeHtml(formatDate(delivery.createdAt))}</dd></dl><dl class="metric"><dt>Lokasi terakhir</dt><dd>${delivery.lastLocation ? `${delivery.lastLocation.latitude}, ${delivery.lastLocation.longitude}` : 'Belum ada'}</dd></dl></section><section class="card"><h2>Histori lokasi</h2>${locations.length ? `<div class="timeline">${locations.map((location) => `<div class="timeline-item"><strong>${escapeHtml(`${location.latitude}, ${location.longitude}`)}</strong><span>${escapeHtml(formatDate(location.recordedAt))}</span></div>`).join('')}</div>` : stateEmpty('Belum ada lokasi.', 'Lokasi akan tampil setelah jastiper mengirim pembaruan.')}</section>${locationForm}${receiptForm}</div><aside class="stack"><section class="card"><h2>Perlindungan perubahan</h2><p>Setiap pengiriman lokasi dan konfirmasi membawa ETag terakhir sehingga perubahan bersamaan dapat dijelaskan dengan jelas.</p></section></aside></div>`);
  } catch (problem) {
    if (token !== renderToken) return;
    app.innerHTML = shell(`${pageHeading('Detail pengantaran', 'Data pengantaran')}${problem.status === 404 ? notFoundState() : stateError(problem)}`);
  }
}

async function renderIssues() {
  const token = ++renderToken;
  clearInterval(pollTimer);
  app.innerHTML = shell(`${pageHeading('Laporan kendala', 'Daftar kendala operasional yang dapat ditindaklanjuti admin.')} ${skeletons(3)}`);
  try {
    const result = await api.listIssues({ conditional: true });
    if (token !== renderToken) return;
    const items = result.data?.items || [];
    app.innerHTML = shell(`${pageHeading('Laporan kendala', 'Daftar kendala operasional yang dapat ditindaklanjuti admin.', '<a class="btn btn-secondary" href="/dashboard" data-nav>Kembali</a>')}${items.length ? `<div class="table-wrap"><table><thead><tr><th>Status</th><th>Kategori</th><th>Deskripsi</th><th></th></tr></thead><tbody>${items.map((issue) => `<tr><td>${badge(issue.status)}</td><td>${escapeHtml(issue.category)}</td><td>${escapeHtml(issue.description)}</td><td><a class="btn btn-secondary btn-small" href="/issues/${encodeURIComponent(issue.issueId)}" data-nav>Detail</a></td></tr>`).join('')}</tbody></table></div>` : stateEmpty('Belum ada laporan.', 'Kasus baru akan tampil di sini setelah dibuat oleh pengguna.')}`);
  } catch (problem) {
    if (token !== renderToken) return;
    app.innerHTML = shell(`${pageHeading('Laporan kendala', 'Daftar kendala operasional')}${stateError(problem, 'retry-issues')}`);
  }
}

async function renderIssueDetail(issueId) {
  const token = ++renderToken;
  clearInterval(pollTimer);
  app.innerHTML = shell(`${pageHeading('Detail kendala', 'Memuat laporan...')}${skeletons(2)}`);
  try {
    const result = await api.getIssue(issueId);
    if (token !== renderToken) return;
    activeContext = { issue: result.data, issueEtag: result.etag };
    const issue = result.data;
    const form = issue.status === 'resolved' ? '' : `<section class="card"><h2>Selesaikan kendala</h2><form id="resolution-form" novalidate><div class="form-grid"><div class="field" data-field="outcome"><label>Hasil</label><select name="outcome" required><option value="no_action">Tidak ada tindakan</option><option value="delivery_restarted">Pengantaran dimulai ulang</option><option value="payment_refunded">Pembayaran dikembalikan</option><option value="request_cancelled">Permintaan dibatalkan</option></select><div class="field-error"></div></div><div class="field" data-field="resolvedAt"><label>Waktu penyelesaian</label><input name="resolvedAt" type="datetime-local" required><div class="field-error"></div></div><div class="field full" data-field="note"><label>Catatan penyelesaian</label><textarea name="note" required maxlength="1000"></textarea><div class="field-error"></div></div></div><button class="btn btn-primary" type="submit">Simpan penyelesaian</button></form></section>`;
    app.innerHTML = shell(`${pageHeading('Detail kendala', `Laporan ${issue.issueId}`, '<a class="btn btn-secondary" href="/issues" data-nav>Kembali</a>')}<div class="detail-layout"><div class="stack"><section class="card"><div class="actions" style="justify-content:space-between"><span class="badge">${escapeHtml(issue.issueId)}</span>${badge(issue.status)}</div><h2>${escapeHtml(issue.description)}</h2><dl class="metric"><dt>Kategori</dt><dd>${escapeHtml(issue.category)}</dd></dl><dl class="metric"><dt>Request</dt><dd>${escapeHtml(issue.requestId)}</dd></dl><dl class="metric"><dt>Dibuat</dt><dd>${escapeHtml(formatDate(issue.createdAt))}</dd></dl>${issue.resolution ? `<div class="timeline-item"><strong>Sudah diselesaikan</strong><span>${escapeHtml(issue.resolution.note)} · ${escapeHtml(formatDate(issue.resolution.resolvedAt))}</span></div>` : ''}</section>${form}</div><aside class="stack"><section class="card"><h2>Catatan</h2><p>Akun admin dapat menyelesaikan laporan. Service tetap mengecek role dan kepemilikan sebelum perubahan.</p></section></aside></div>`);
  } catch (problem) {
    if (token !== renderToken) return;
    app.innerHTML = shell(`${pageHeading('Detail kendala', 'Data laporan')}${problem.status === 404 ? notFoundState() : stateError(problem)}`);
  }
}

async function submitRequest(form) {
  if (!validateRequired(form, [['itemDescription', 'Nama barang wajib diisi.'], ['targetStoreOrArea', 'Toko atau area wajib diisi.'], ['deliveryAddress', 'Alamat pengantaran wajib diisi.'], ['deadline', 'Batas waktu wajib diisi.']])) return;
  const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
  const body = { itemDescription: form.elements.itemDescription.value.trim(), quantity: Number(form.elements.quantity.value), targetStoreOrArea: form.elements.targetStoreOrArea.value.trim(), budget: { amount: Number(form.elements.budgetAmount.value), currency: 'IDR' }, deliveryAddress: form.elements.deliveryAddress.value.trim(), deadline: isoFromInput(form.elements.deadline.value) };
  try { const result = await api.createRequest(body); navigate(`/requests/${encodeURIComponent(result.data.requestId)}`); }
  catch (problem) { setFormErrors(form, problem); submit.disabled = false; }
}

async function submitOffer(form) {
  if (!validateRequired(form, [['itemPrice', 'Harga barang wajib diisi.'], ['serviceFee', 'Biaya jasa wajib diisi.'], ['deliveryFee', 'Biaya antar wajib diisi.'], ['estimatedArrivalAt', 'Perkiraan tiba wajib diisi.'], ['stockCheckedAt', 'Waktu cek stok wajib diisi.'], ['expiresAt', 'Batas berlaku wajib diisi.']])) return;
  const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
  const body = { itemPrice: { amount: Number(form.elements.itemPrice.value), currency: 'IDR' }, serviceFee: { amount: Number(form.elements.serviceFee.value), currency: 'IDR' }, deliveryFee: { amount: Number(form.elements.deliveryFee.value), currency: 'IDR' }, estimatedArrivalAt: isoFromInput(form.elements.estimatedArrivalAt.value), stockCheckedAt: isoFromInput(form.elements.stockCheckedAt.value), expiresAt: isoFromInput(form.elements.expiresAt.value), note: form.elements.note.value.trim() || null };
  try { await api.createOffer(activeContext.request.requestId, body, activeContext.requestEtag); await renderRequestDetail(activeContext.request.requestId, 'Penawaran berhasil dikirim.'); }
  catch (problem) { setFormErrors(form, problem); submit.disabled = false; if (problem.status === 412) await renderRequestDetail(activeContext.request.requestId, problem.detail); }
}

async function submitPayment(form) {
  const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
  try {
    const result = await api.createPayment(activeContext.assignment.assignmentId, form.elements.method.value, activeContext.assignmentEtag);
    await renderAssignmentDetail(activeContext.assignment.assignmentId, `Pembayaran ${escapeHtml(result.data.status)} berhasil dibuat.`);
  } catch (problem) {
    setFormErrors(form, problem); submit.disabled = false;
    if (problem.status === 412) await renderAssignmentDetail(activeContext.assignment.assignmentId, problem.detail);
  }
}

async function submitDelivery(form) {
  if (!validateRequired(form, [['purchaseRecordedAt', 'Waktu pembelian wajib diisi.']])) return;
  const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
  try { const result = await api.createDelivery(activeContext.assignment.assignmentId, isoFromInput(form.elements.purchaseRecordedAt.value), activeContext.assignmentEtag); navigate(`/deliveries/${encodeURIComponent(result.data.deliveryId)}`); }
  catch (problem) { setFormErrors(form, problem); submit.disabled = false; if (problem.status === 412) await renderAssignmentDetail(activeContext.assignment.assignmentId, problem.detail); }
}

async function submitLocation(form) {
  if (!validateRequired(form, [['latitude', 'Latitude wajib diisi.'], ['longitude', 'Longitude wajib diisi.']])) return;
  const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
  try { await api.createLocation(activeContext.delivery.deliveryId, { latitude: Number(form.elements.latitude.value), longitude: Number(form.elements.longitude.value), recordedAt: new Date().toISOString() }, activeContext.deliveryEtag); await renderDeliveryDetail(activeContext.delivery.deliveryId); }
  catch (problem) { setFormErrors(form, problem); submit.disabled = false; }
}

async function submitReceipt(form) {
  if (!validateRequired(form, [['recipientName', 'Nama penerima wajib diisi.']])) return;
  const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
  try { const result = await api.confirmReceipt(activeContext.delivery.deliveryId, { confirmedAt: new Date().toISOString(), recipientName: form.elements.recipientName.value.trim(), note: form.elements.note.value.trim() || null }, activeContext.deliveryEtag); form.innerHTML = `<div class="stale" role="status">Penerimaan dikonfirmasi dengan ID ${escapeHtml(result.data.confirmationId)}.</div>`; }
  catch (problem) { setFormErrors(form, problem); submit.disabled = false; if (problem.status === 412) await renderDeliveryDetail(activeContext.delivery.deliveryId); }
}

async function submitResolution(form) {
  if (!validateRequired(form, [['note', 'Catatan wajib diisi.'], ['resolvedAt', 'Waktu penyelesaian wajib diisi.']])) return;
  const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
  try { await api.resolveIssue(activeContext.issue.issueId, { outcome: form.elements.outcome.value, note: form.elements.note.value.trim(), resolvedAt: isoFromInput(form.elements.resolvedAt.value) }, activeContext.issueEtag); await renderIssueDetail(activeContext.issue.issueId); }
  catch (problem) { setFormErrors(form, problem); submit.disabled = false; if (problem.status === 412) await renderIssueDetail(activeContext.issue.issueId); }
}

async function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === 'request-form') return submitRequest(form);
  if (form.id === 'offer-form') return submitOffer(form);
  if (form.id === 'payment-form') return submitPayment(form);
  if (form.id === 'delivery-form') return submitDelivery(form);
  if (form.id === 'location-form') return submitLocation(form);
  if (form.id === 'receipt-form') return submitReceipt(form);
  if (form.id === 'resolution-form') return submitResolution(form);
}

async function handleClick(event) {
  const navLink = event.target.closest('[data-nav]');
  if (navLink) { event.preventDefault(); navigate(navLink.getAttribute('href')); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'login') return auth.beginLogin(button.dataset.returnTo || '/dashboard');
  if (action === 'signout') { auth.signOut(); api.invalidateCaches(); navigate('/signin'); return; }
  if (action === 'retry-dashboard') return renderDashboard();
  if (action === 'retry-issues') return renderIssues();
  if (action === 'retry-request') { const id = window.location.pathname.split('/')[2]; return renderRequestDetail(decodeURIComponent(id)); }
  if (action === 'retry-assignment') { const id = window.location.pathname.split('/')[2]; return renderAssignmentDetail(decodeURIComponent(id)); }
  if (action === 'reload-request') { const id = window.location.pathname.split('/')[2]; return renderRequestDetail(decodeURIComponent(id)); }
  if (action === 'reload-assignment') { const id = window.location.pathname.split('/')[2]; return renderAssignmentDetail(decodeURIComponent(id)); }
  if (action === 'select-offer') {
    button.disabled = true;
    try {
      const result = await api.selectOffer(activeContext.request.requestId, button.dataset.offerId, activeContext.requestEtag);
      const asgId = result.data.assignmentId;
      if (asgId) {
        try { localStorage.setItem('titipin.asg.' + activeContext.request.requestId, asgId); } catch {}
        navigate(`/assignments/${encodeURIComponent(asgId)}`);
      } else {
        await renderRequestDetail(activeContext.request.requestId, 'Penawaran berhasil dipilih.');
      }
    } catch (problem) {
      if (problem.status === 412) await renderRequestDetail(activeContext.request.requestId, problem.detail);
      else { alert(problem.detail || 'Gagal memilih penawaran'); button.disabled = false; }
    }
  }
}

async function renderRoute() {
  const pathname = window.location.pathname;
  if (pathname === '/callback') {
    app.innerHTML = shell(`<section class="auth-card card"><h1>Menyelesaikan login...</h1><p>Memeriksa authorization code dan menyiapkan sesi.</p></section>`);
    try { const result = await auth.finishLogin(); navigate(result.returnTo || '/dashboard'); }
    catch (error) { signinView(error.message); }
    return;
  }
  if (pathname === '/signin') { if (auth.getSession()) return navigate('/dashboard'); return signinView(); }
  if (!auth.getSession() && protectedPath(pathname)) return navigate(`/signin?returnTo=${encodeURIComponent(pathname + window.location.search)}`);
  if (pathname === '/' || pathname === '/dashboard') return auth.getSession() ? renderDashboard() : (app.innerHTML = shell(`<section class="hero"><span class="badge">Jasa titip lokal</span><h1>Belanja dari kota mana pun, tetap terasa dekat.</h1><p>Titipin menghubungkan pemesan dengan jastiper terverifikasi. Masuk untuk membuat permintaan, mengajukan penawaran, atau memantau pengantaran.</p><div class="actions"><a class="btn btn-primary" href="/signin" data-nav>Masuk ke Titipin</a></div></section><section class="card-grid"><article class="card"><h2>Alur yang jelas</h2><p>Permintaan, penawaran, penugasan, pembayaran, dan pengantaran punya alamat URL masing-masing.</p></article><article class="card"><h2>Data tetap aman</h2><p>Service tetap menjadi pemeriksa identitas, scope, kepemilikan, dan aturan bisnis.</p></article><article class="card"><h2>Perubahan terlindungi</h2><p>ETag, If-None-Match, If-Match, dan idempotency key mencegah data diam-diam tertimpa.</p></article></section>`));
  if (pathname === '/requests/new') return renderRequestForm();
  if (pathname === '/issues') return renderIssues();
  const match = pathname.match(/^\/requests\/([^/]+)$/); if (match) return renderRequestDetail(decodeURIComponent(match[1]));
  const assignmentMatch = pathname.match(/^\/assignments\/([^/]+)$/); if (assignmentMatch) return renderAssignmentDetail(decodeURIComponent(assignmentMatch[1]));
  const deliveryMatch = pathname.match(/^\/deliveries\/([^/]+)$/); if (deliveryMatch) return renderDeliveryDetail(decodeURIComponent(deliveryMatch[1]));
  const issueMatch = pathname.match(/^\/issues\/([^/]+)$/); if (issueMatch) return renderIssueDetail(decodeURIComponent(issueMatch[1]));
  app.innerHTML = shell(`${pageHeading('Halaman tidak ditemukan', 'Alamat yang kamu buka tidak tersedia.')}${notFoundState()}`);
}

document.addEventListener('click', handleClick);
document.addEventListener('submit', handleSubmit);
window.addEventListener('popstate', renderRoute);
renderRoute();
