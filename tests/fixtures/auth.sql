-- Only loaded by the isolated test harness, never into the user's database.
--
-- Konvensi penamaan ID fixture:
--   req_  : requests  (status: open_*, assigned_*, completed_*)
--   off_  : offers    (status: open_* = active, assigned_* = selected)
--   asg_  : assignments (status: purchased, completed)
--   pay_  : payments  (status: succeeded, declined)
--   dlv_  : deliveries (status: pending, in_transit, delivered, confirmed)
--   loc_  : location_updates
--   rcp_  : receipt_confirmations
--   iss_  : transaction_issues
-- Semua _a = milik requester_a / jastiper_a, _b = milik requester_b / jastiper_b.

-- ── ACCOUNTS ─────────────────────────────────────────────────────────────────
INSERT INTO public.accounts (account_id, display_name, role, verification_status) VALUES
 ('acc_requester_a', 'Requester A', 'requester', 'verified'),
 ('acc_requester_b', 'Requester B', 'requester', 'verified'),
 ('acc_jastiper_a', 'Jastiper A', 'jastiper', 'verified'),
 ('acc_jastiper_b', 'Jastiper B', 'jastiper', 'verified'),
 ('acc_admin_a', 'Admin A', 'admin', 'verified'),
 ('acc_admin_b', 'Admin B', 'admin', 'verified');

-- ── REQUESTS ─────────────────────────────────────────────────────────────────
-- req_assigned_*  : status=assigned  (dipakai oleh test authz lama)
-- req_open_*      : status=open      (dipakai oleh test selection & offer)
-- req_completed_* : status=completed (dipakai oleh test receipt + issues)
INSERT INTO public.requests (request_id, requester_id, item_description, quantity,
 target_store_or_area, budget_amount, delivery_address, deadline, status, created_at) VALUES
 ('req_assigned_a', 'acc_requester_a', 'Notebook A', 1, 'Store A', 150000, 'Private address A', CURRENT_TIMESTAMP + INTERVAL '2 days', 'assigned', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
 ('req_assigned_b', 'acc_requester_b', 'Notebook B', 1, 'Store B', 150000, 'Private address B', CURRENT_TIMESTAMP + INTERVAL '2 days', 'assigned', CURRENT_TIMESTAMP),
 ('req_open_a',     'acc_requester_a', 'Open A',     1, 'Store A', 150000, 'Private open A',    CURRENT_TIMESTAMP + INTERVAL '2 days', 'open',     CURRENT_TIMESTAMP - INTERVAL '2 hours'),
 ('req_open_b',     'acc_requester_b', 'Open B',     1, 'Store B', 150000, 'Private open B',    CURRENT_TIMESTAMP + INTERVAL '2 days', 'open',     CURRENT_TIMESTAMP - INTERVAL '3 hours'),
 -- req_completed_* sudah selesai penuh (receipt confirmed). Dipakai modul 5e & 7.
 ('req_completed_a', 'acc_requester_a', 'Completed A', 1, 'Store A', 150000, 'Private completed A', CURRENT_TIMESTAMP + INTERVAL '2 days', 'completed', CURRENT_TIMESTAMP - INTERVAL '5 hours'),
 ('req_completed_b', 'acc_requester_b', 'Completed B', 1, 'Store B', 150000, 'Private completed B', CURRENT_TIMESTAMP + INTERVAL '2 days', 'completed', CURRENT_TIMESTAMP - INTERVAL '6 hours'),
 -- req_paid_* sudah punya payment succeeded tapi belum ada delivery. Dipakai modul 5a.
 ('req_paid_a', 'acc_requester_a', 'Paid A', 1, 'Store A', 150000, 'Private paid A', CURRENT_TIMESTAMP + INTERVAL '2 days', 'assigned', CURRENT_TIMESTAMP - INTERVAL '4 hours');

-- ── OFFERS ───────────────────────────────────────────────────────────────────
INSERT INTO public.offers (offer_id, request_id, jastiper_id, status,
 item_price_amount, service_fee_amount, delivery_fee_amount, estimated_arrival_at,
 stock_checked_at, expires_at) VALUES
 ('off_assigned_a',  'req_assigned_a',  'acc_jastiper_a', 'selected', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_assigned_b',  'req_assigned_b',  'acc_jastiper_b', 'selected', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_open_a',      'req_open_a',      'acc_jastiper_a', 'active',   100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_open_b',      'req_open_b',      'acc_jastiper_b', 'active',   100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_completed_a', 'req_completed_a', 'acc_jastiper_a', 'selected', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_completed_b', 'req_completed_b', 'acc_jastiper_b', 'selected', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
 ('off_paid_a',      'req_paid_a',      'acc_jastiper_a', 'selected', 100000, 10000, 10000, CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day');

-- ── ASSIGNMENTS ──────────────────────────────────────────────────────────────
-- asg_assigned_*  : status=purchased   (delivery sudah ada, dipakai authz lama)
-- asg_completed_* : status=completed   (receipt confirmed, dipakai modul 5e & 7)
-- asg_paid_*      : status=purchased   (payment succeeded, belum ada delivery)
INSERT INTO public.assignments (assignment_id, request_id, offer_id, assigned_jastiper_id, status,
 assigned_at, purchase_recorded_at, completed_at, updated_at) VALUES
 ('asg_assigned_a',  'req_assigned_a',  'off_assigned_a',  'acc_jastiper_a', 'purchased',  CURRENT_TIMESTAMP - INTERVAL '1 hour',  CURRENT_TIMESTAMP - INTERVAL '55 minutes', NULL, CURRENT_TIMESTAMP - INTERVAL '55 minutes'),
 ('asg_assigned_b',  'req_assigned_b',  'off_assigned_b',  'acc_jastiper_b', 'purchased',  CURRENT_TIMESTAMP,                       NULL,                                      NULL, CURRENT_TIMESTAMP),
 ('asg_completed_a', 'req_completed_a', 'off_completed_a', 'acc_jastiper_a', 'completed',  CURRENT_TIMESTAMP - INTERVAL '5 hours',  CURRENT_TIMESTAMP - INTERVAL '4 hours 30 minutes', CURRENT_TIMESTAMP - INTERVAL '30 minutes', CURRENT_TIMESTAMP - INTERVAL '30 minutes'),
 ('asg_completed_b', 'req_completed_b', 'off_completed_b', 'acc_jastiper_b', 'completed',  CURRENT_TIMESTAMP - INTERVAL '6 hours',  CURRENT_TIMESTAMP - INTERVAL '5 hours 30 minutes', CURRENT_TIMESTAMP - INTERVAL '45 minutes', CURRENT_TIMESTAMP - INTERVAL '45 minutes'),
 ('asg_paid_a',      'req_paid_a',      'off_paid_a',      'acc_jastiper_a', 'purchased',  CURRENT_TIMESTAMP - INTERVAL '4 hours',  CURRENT_TIMESTAMP - INTERVAL '3 hours 30 minutes', NULL, CURRENT_TIMESTAMP - INTERVAL '3 hours 30 minutes');

-- ── PAYMENTS ─────────────────────────────────────────────────────────────────
-- pay_succeeded_* : sukses, dipakai GET /payments/:id & sebagai prasyarat delivery
-- pay_declined_a  : gagal (declined), dipakai skenario 422 payment-declined
-- total_amount = item_price + service_fee + delivery_fee = 100000+10000+10000 = 120000
INSERT INTO public.payments (payment_id, assignment_id, amount, currency, method, status,
 failure_reason_code, commission_amount, created_at, updated_at, refunded_at) VALUES
 -- Pembayaran succeeded untuk asg_assigned_a (dipakai delivery dlv_assigned_a)
 ('pay_succeeded_a', 'asg_assigned_a', 120000, 'IDR', 'simulated_card',          'succeeded', NULL, 6000, CURRENT_TIMESTAMP - INTERVAL '55 minutes', CURRENT_TIMESTAMP - INTERVAL '55 minutes', NULL),
 -- Pembayaran succeeded untuk asg_assigned_b (dipakai delivery dlv_assigned_b)
 ('pay_succeeded_b', 'asg_assigned_b', 120000, 'IDR', 'simulated_bank_transfer', 'succeeded', NULL, 6000, CURRENT_TIMESTAMP,                        CURRENT_TIMESTAMP,                        NULL),
 -- Pembayaran succeeded untuk asg_completed_a (delivery sudah confirmed)
 ('pay_completed_a', 'asg_completed_a', 120000, 'IDR', 'simulated_card',         'succeeded', NULL, 6000, CURRENT_TIMESTAMP - INTERVAL '4 hours 30 minutes', CURRENT_TIMESTAMP - INTERVAL '4 hours 30 minutes', NULL),
 -- Pembayaran succeeded untuk asg_completed_b (delivery sudah confirmed)
 ('pay_completed_b', 'asg_completed_b', 120000, 'IDR', 'simulated_card',         'succeeded', NULL, 6000, CURRENT_TIMESTAMP - INTERVAL '5 hours 30 minutes', CURRENT_TIMESTAMP - INTERVAL '5 hours 30 minutes', NULL),
 -- Pembayaran succeeded untuk asg_paid_a (siap dibuat delivery)
 ('pay_paid_a', 'asg_paid_a', 120000, 'IDR', 'simulated_card',                   'succeeded', NULL, 6000, CURRENT_TIMESTAMP - INTERVAL '3 hours 30 minutes', CURRENT_TIMESTAMP - INTERVAL '3 hours 30 minutes', NULL);

-- ── DELIVERIES ───────────────────────────────────────────────────────────────
-- dlv_assigned_*  : status=in_transit (dipakai authz lama untuk location update)
-- dlv_delivered_* : status=delivered  (siap untuk receipt confirmation test)
-- dlv_confirmed_* : status=confirmed  (sudah ada receipt, dipakai GET receipt & issues)
INSERT INTO public.deliveries (delivery_id, assignment_id, status, delivery_address,
 created_at, started_at, delivered_at) VALUES
 -- in_transit: dipakai authz lama + test location update
 ('dlv_assigned_a', 'asg_assigned_a', 'in_transit', 'Private address A',   CURRENT_TIMESTAMP - INTERVAL '50 minutes', CURRENT_TIMESTAMP - INTERVAL '45 minutes', NULL),
 ('dlv_assigned_b', 'asg_assigned_b', 'in_transit', 'Private address B',   CURRENT_TIMESTAMP,                         NULL,                                      NULL),
 -- delivered: siap menerima receipt confirmation (belum ada rcp)
 ('dlv_delivered_a', 'asg_completed_a', 'delivered', 'Private completed A', CURRENT_TIMESTAMP - INTERVAL '4 hours',   CURRENT_TIMESTAMP - INTERVAL '3 hours 30 minutes', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
 -- confirmed: sudah ada receipt_confirmation
 ('dlv_confirmed_b', 'asg_completed_b', 'confirmed', 'Private completed B', CURRENT_TIMESTAMP - INTERVAL '5 hours',   CURRENT_TIMESTAMP - INTERVAL '4 hours 30 minutes', CURRENT_TIMESTAMP - INTERVAL '2 hours');

-- ── LOCATION UPDATES ─────────────────────────────────────────────────────────
-- Dua update untuk dlv_assigned_a: dipakai test GET /deliveries/:id (lastLocation non-null)
-- dan test GET /deliveries/:id/locations (pagination).
INSERT INTO public.location_updates (location_id, delivery_id, latitude, longitude,
 recorded_at, received_at) VALUES
 ('loc_assigned_a_1', 'dlv_assigned_a', -6.1800, 106.7900, CURRENT_TIMESTAMP - INTERVAL '40 minutes', CURRENT_TIMESTAMP - INTERVAL '40 minutes'),
 ('loc_assigned_a_2', 'dlv_assigned_a', -6.1889, 106.7972, CURRENT_TIMESTAMP - INTERVAL '35 minutes', CURRENT_TIMESTAMP - INTERVAL '35 minutes');

-- ── RECEIPT CONFIRMATIONS ────────────────────────────────────────────────────
-- Satu confirmation untuk dlv_confirmed_b: dipakai GET /receipt-confirmations/:id
-- dan test GET /deliveries/:id (confirmedAt non-null).
INSERT INTO public.receipt_confirmations (confirmation_id, delivery_id, confirmed_by_account_id,
 confirmed_at, recipient_name, note) VALUES
 ('rcp_confirmed_b', 'dlv_confirmed_b', 'acc_requester_b',
  CURRENT_TIMESTAMP - INTERVAL '45 minutes', 'Recipient B', 'Package received in good condition.');

-- ── TRANSACTION ISSUES ───────────────────────────────────────────────────────
-- iss_open_a    : status=open      (dipakai GET /issues, GET /issues/:id)
-- iss_inreview_a: status=in_review (dipakai GET /issues?status=in_review)
-- iss_resolved_b: status=resolved  (sudah ada resolution; dipakai 409 issue-already-resolved)
-- Semua issues mereferensikan req_completed_* / asg_completed_* / pay_completed_*
-- karena FK issues membutuhkan assignment + payment + delivery yang konsisten.
INSERT INTO public.transaction_issues (issue_id, created_by_account_id,
 request_id, assignment_id, payment_id, delivery_id,
 category, description, status, notes, created_at, updated_at) VALUES
 -- iss_open_a & iss_inreview_a: milik transaksi _a (delivery = dlv_delivered_a)
 ('iss_open_a',     'acc_requester_a', 'req_completed_a', 'asg_completed_a', 'pay_completed_a', 'dlv_delivered_a',
  'payment',  'Payment was accepted but the delivery took too long.',  'open',      NULL,
  CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP - INTERVAL '1 hour'),
 ('iss_inreview_a', 'acc_jastiper_a',  'req_completed_a', 'asg_completed_a', 'pay_completed_a', 'dlv_delivered_a',
  'delivery', 'Delivery address was unclear.',                          'in_review', 'Administrator is checking the assignment state.',
  CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '1 hour 30 minutes'),
 -- iss_resolved_b: milik transaksi _b (delivery = dlv_confirmed_b)
 ('iss_resolved_b', 'acc_requester_b', 'req_completed_b', 'asg_completed_b', 'pay_completed_b', 'dlv_confirmed_b',
  'receipt',  'Receipt was not confirmed in time.',                     'resolved',  'Issue closed after receipt was confirmed.',
  CURRENT_TIMESTAMP - INTERVAL '3 hours', CURRENT_TIMESTAMP - INTERVAL '2 hours 30 minutes');

-- ── ISSUE RESOLUTIONS ────────────────────────────────────────────────────────
-- Resolusi untuk iss_resolved_b: dipakai test GET /issues/:id (resolution non-null)
-- dan test 409 issue-already-resolved.
INSERT INTO public.issue_resolutions (issue_id, outcome, note, resolved_at, resolved_by_account_id) VALUES
 ('iss_resolved_b', 'no_action', 'Issue closed after receipt was confirmed.',
  CURRENT_TIMESTAMP - INTERVAL '2 hours 30 minutes', 'acc_admin_b');
