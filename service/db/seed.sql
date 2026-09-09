-- Titipin - Data Awal (Seed Data) untuk Pengujian dan Demonstrasi
-- File: service/db/seed.sql
-- Acuan: service/db/schema.sql dan openapi.yaml
-- Cara menjalankan:
-- psql -U postgres -d titipin -v ON_ERROR_STOP=1 -f service/db/seed.sql

BEGIN;

-- Bersihkan data lama jika ada agar seed bersifat idempotent
TRUNCATE TABLE 
    public.accounts,
    public.requests,
    public.offers,
    public.assignments,
    public.payments,
    public.deliveries,
    public.location_updates,
    public.receipt_confirmations,
    public.transaction_issues,
    public.issue_resolutions,
    public.idempotency_keys
CASCADE;

-- =============================================================================
-- 1. ACCOUNTS
-- Pengguna dengan role: requester, jastiper, admin
-- =============================================================================
INSERT INTO public.accounts (account_id, display_name, role, verification_status, created_at, updated_at)
VALUES
    ('acc_req_ridlo', 'Ridlo Fanata Wicaksana', 'requester', 'verified', '2026-09-01 08:00:00+07', '2026-09-01 08:00:00+07'),
    ('acc_jas_javier', 'Javier Gavra Abhinaya', 'jastiper', 'verified', '2026-09-01 08:30:00+07', '2026-09-01 08:30:00+07'),
    ('acc_adm_alif', 'Nur Alif Maulana Syafrudin', 'admin', 'verified', '2026-09-01 07:00:00+07', '2026-09-01 07:00:00+07'),
    ('acc_jas_dimas', 'Dimas Pratama', 'jastiper', 'verified', '2026-09-02 09:00:00+07', '2026-09-02 09:00:00+07'),
    ('acc_req_siti', 'Siti Nurhaliza', 'requester', 'verified', '2026-09-02 10:00:00+07', '2026-09-02 10:00:00+07');

-- =============================================================================
-- 2. REQUESTS
-- 4 Skenario:
--   req_01_open: Permintaan baru berstatus 'open' (siap menerima pemilihan offer)
--   req_02_transit: Permintaan berstatus 'assigned' (sedang diantarkan jastiper)
--   req_03_completed: Permintaan berstatus 'completed' (sudah diterima pemesan)
--   req_04_issue: Permintaan dengan kendala stok berstatus 'unavailable'
-- =============================================================================
INSERT INTO public.requests (
    request_id, requester_id, item_description, quantity, target_store_or_area,
    budget_amount, budget_currency, delivery_address, deadline, status, created_at, updated_at
) VALUES
    (
        'req_01_open',
        'acc_req_ridlo',
        'Buku Catatan Penelitian Hardcover A5 Kotak-kotak',
        2,
        'Gramedia Grand Indonesia, Jakarta Pusat',
        150000,
        'IDR',
        'Jl. Salemba Raya No. 4, Jakarta Pusat',
        '2026-09-12 18:00:00+07',
        'open',
        '2026-09-08 09:00:00+07',
        '2026-09-08 09:00:00+07'
    ),
    (
        'req_02_transit',
        'acc_req_siti',
        'Biji Kopi Arabika Malabar 250gr Medium Roast',
        1,
        'Toko Kopi Aroma, Bandung',
        100000,
        'IDR',
        'Jl. Dago No. 120, Bandung',
        '2026-09-10 15:00:00+07',
        'assigned',
        '2026-09-07 10:00:00+07',
        '2026-09-07 11:30:00+07'
    ),
    (
        'req_03_completed',
        'acc_req_ridlo',
        'Brownies Kukus Amanda Original Rasa Cokelat',
        2,
        'Outlet Amanda Brownies Pasteur, Bandung',
        120000,
        'IDR',
        'Jl. Dipatiukur No. 45, Bandung',
        '2026-09-06 20:00:00+07',
        'completed',
        '2026-09-04 13:00:00+07',
        '2026-09-05 16:30:00+07'
    ),
    (
        'req_04_issue',
        'acc_req_siti',
        'Pastry Keju Spesial Kartika Sari',
        1,
        'Kartika Sari Kebon Jukut, Bandung',
        90000,
        'IDR',
        'Jl. Merdeka No. 10, Bandung',
        '2026-09-05 17:00:00+07',
        'unavailable',
        '2026-09-03 11:00:00+07',
        '2026-09-03 15:00:00+07'
    );

-- =============================================================================
-- 3. OFFERS
-- Catatan: total_amount dihitung otomatis oleh PostgreSQL (GENERATED ALWAYS)
-- =============================================================================
INSERT INTO public.offers (
    offer_id, request_id, jastiper_id, status,
    item_price_amount, service_fee_amount, delivery_fee_amount, currency,
    estimated_arrival_at, stock_checked_at, expires_at, note, created_at
) VALUES
    -- Penawaran untuk req_01_open (2 penawaran aktif bersaing)
    (
        'off_01_active_javier',
        'req_01_open',
        'acc_jas_javier',
        'active',
        120000, 20000, 10000, 'IDR',
        '2026-09-11 14:00:00+07', '2026-09-08 10:00:00+07', '2026-09-10 18:00:00+07',
        'Stok ready di rak alat tulis lantai 2. Siap belikan segera.',
        '2026-09-08 10:05:00+07'
    ),
    (
        'off_02_active_dimas',
        'req_01_open',
        'acc_jas_dimas',
        'active',
        120000, 15000, 12000, 'IDR',
        '2026-09-11 12:00:00+07', '2026-09-08 10:30:00+07', '2026-09-10 18:00:00+07',
        'Bisa saya belikan nanti sore saat mampir ke GI.',
        '2026-09-08 10:35:00+07'
    ),
    -- Penawaran terpilih untuk req_02_transit
    (
        'off_03_selected_javier',
        'req_02_transit',
        'acc_jas_javier',
        'selected',
        75000, 15000, 10000, 'IDR',
        '2026-09-09 17:00:00+07', '2026-09-07 10:45:00+07', '2026-09-08 15:00:00+07',
        'Biji kopi fresh roast siap diantar.',
        '2026-09-07 11:00:00+07'
    ),
    -- Penawaran terpilih untuk req_03_completed
    (
        'off_04_selected_dimas',
        'req_03_completed',
        'acc_jas_dimas',
        'selected',
        90000, 15000, 10000, 'IDR',
        '2026-09-05 16:00:00+07', '2026-09-04 14:00:00+07', '2026-09-05 12:00:00+07',
        'Langsung beli dari outlet resmi.',
        '2026-09-04 14:15:00+07'
    ),
    -- Penawaran terpilih untuk req_04_issue
    (
        'off_05_selected_javier',
        'req_04_issue',
        'acc_jas_javier',
        'selected',
        70000, 12000, 8000, 'IDR',
        '2026-09-03 16:00:00+07', '2026-09-03 11:30:00+07', '2026-09-04 12:00:00+07',
        'Toko sedang ramai, akan dicek langsung ke kasir.',
        '2026-09-03 11:45:00+07'
    );

-- =============================================================================
-- 4. ASSIGNMENTS
-- Relasi antara request, offer terpilih, dan jastiper yang ditugaskan
-- =============================================================================
INSERT INTO public.assignments (
    assignment_id, request_id, offer_id, assigned_jastiper_id,
    status, assigned_at, purchase_recorded_at, completed_at, updated_at
) VALUES
    (
        'asg_02_transit',
        'req_02_transit',
        'off_03_selected_javier',
        'acc_jas_javier',
        'purchased',
        '2026-09-07 11:30:00+07',
        '2026-09-07 14:00:00+07',
        NULL,
        '2026-09-07 14:00:00+07'
    ),
    (
        'asg_03_completed',
        'req_03_completed',
        'off_04_selected_dimas',
        'acc_jas_dimas',
        'completed',
        '2026-09-04 15:00:00+07',
        '2026-09-05 11:00:00+07',
        '2026-09-05 16:30:00+07',
        '2026-09-05 16:30:00+07'
    ),
    (
        'asg_04_unavailable',
        'req_04_issue',
        'off_05_selected_javier',
        'acc_jas_javier',
        'unavailable',
        '2026-09-03 12:00:00+07',
        NULL,
        NULL,
        '2026-09-03 14:30:00+07'
    );

-- =============================================================================
-- 5. PAYMENTS
-- Pembayaran simulasi untuk assignment
-- =============================================================================
INSERT INTO public.payments (
    payment_id, assignment_id, amount, currency, method, status,
    failure_reason_code, commission_amount, created_at, updated_at, refunded_at
) VALUES
    (
        'pay_02_succeeded',
        'asg_02_transit',
        100000,
        'IDR',
        'simulated_bank_transfer',
        'succeeded',
        NULL,
        2500,
        '2026-09-07 11:35:00+07',
        '2026-09-07 11:36:00+07',
        NULL
    ),
    (
        'pay_03_succeeded',
        'asg_03_completed',
        115000,
        'IDR',
        'simulated_card',
        'succeeded',
        NULL,
        2875,
        '2026-09-04 15:05:00+07',
        '2026-09-04 15:06:00+07',
        NULL
    ),
    (
        'pay_04_refunded',
        'asg_04_unavailable',
        90000,
        'IDR',
        'simulated_bank_transfer',
        'refunded',
        NULL,
        0,
        '2026-09-03 12:05:00+07',
        '2026-09-03 15:00:00+07',
        '2026-09-03 15:00:00+07'
    );

-- =============================================================================
-- 6. DELIVERIES
-- Pelacakan pengantaran
-- =============================================================================
INSERT INTO public.deliveries (
    delivery_id, assignment_id, status, delivery_address, created_at, started_at, delivered_at
) VALUES
    (
        'del_02_in_transit',
        'asg_02_transit',
        'in_transit',
        'Jl. Dago No. 120, Bandung',
        '2026-09-07 14:10:00+07',
        '2026-09-07 14:15:00+07',
        NULL
    ),
    (
        'del_03_confirmed',
        'asg_03_completed',
        'confirmed',
        'Jl. Dipatiukur No. 45, Bandung',
        '2026-09-05 11:15:00+07',
        '2026-09-05 15:00:00+07',
        '2026-09-05 16:15:00+07'
    ),
    (
        'del_04_pending',
        'asg_04_unavailable',
        'pending',
        'Jl. Merdeka No. 10, Bandung',
        '2026-09-03 12:10:00+07',
        NULL,
        NULL
    );

-- =============================================================================
-- 7. LOCATION UPDATES
-- Pembaruan koordinat GPS dari tracking device / aplikasi jastiper
-- =============================================================================
INSERT INTO public.location_updates (
    location_id, delivery_id, latitude, longitude, recorded_at, received_at
) VALUES
    (
        'loc_01_aroma',
        'del_02_in_transit',
        -6.9175,
        107.6191,
        '2026-09-07 14:20:00+07',
        '2026-09-07 14:20:05+07'
    ),
    (
        'loc_02_dago_bawah',
        'del_02_in_transit',
        -6.9034,
        107.6120,
        '2026-09-07 14:35:00+07',
        '2026-09-07 14:35:04+07'
    ),
    (
        'loc_03_dago_tengah',
        'del_02_in_transit',
        -6.8915,
        107.6106,
        '2026-09-07 14:50:00+07',
        '2026-09-07 14:50:06+07'
    );

-- =============================================================================
-- 8. RECEIPT CONFIRMATIONS
-- Konfirmasi penerimaan barang oleh pemesan
-- =============================================================================
INSERT INTO public.receipt_confirmations (
    confirmation_id, delivery_id, confirmed_by_account_id, confirmed_at, recipient_name, note
) VALUES
    (
        'rc_03_completed',
        'del_03_confirmed',
        'acc_req_ridlo',
        '2026-09-05 16:30:00+07',
        'Ridlo Fanata Wicaksana',
        'Barang brownies diterima dalam kondisi utuh dan fresh.'
    );

-- =============================================================================
-- 9. TRANSACTION ISSUES & RESOLUTIONS
-- Kendala transaksi dan penyelesaian oleh Admin
-- =============================================================================
INSERT INTO public.transaction_issues (
    issue_id, created_by_account_id, request_id, assignment_id, payment_id, delivery_id,
    category, description, status, notes, created_at, updated_at
) VALUES
    (
        'iss_01_stock_empty',
        'acc_req_siti',
        'req_04_issue',
        'asg_04_unavailable',
        'pay_04_refunded',
        'del_04_pending',
        'availability',
        'Stok pastry keju habis di toko dan jastiper mengabarkan varian tersebut tidak diproduksi hari ini.',
        'resolved',
        'Admin memverifikasi laporan jastiper dan memproses pengembalian dana simulasi.',
        '2026-09-03 14:30:00+07',
        '2026-09-03 15:00:00+07'
    );

INSERT INTO public.issue_resolutions (
    issue_id, outcome, note, resolved_at, resolved_by_account_id
) VALUES
    (
        'iss_01_stock_empty',
        'payment_refunded',
        'Pengembalian dana simulasi Rp 90.000 telah disetujui dan transaksi ditandai selesai/refunded.',
        '2026-09-03 15:00:00+07',
        'acc_adm_alif'
    );

-- =============================================================================
-- 10. IDEMPOTENCY KEYS
-- Contoh key tersimpan untuk pengujian request replay / idempotency
-- =============================================================================
INSERT INTO public.idempotency_keys (
    actor_scope, idempotency_key, request_method, request_uri, request_hash,
    status, response_status, response_headers, response_body, created_at, expires_at, completed_at
) VALUES
    (
        'acc_req_ridlo',
        '0f7c1b9e-3d21-4a6f-9c05-8e2b7d41a9f0',
        'POST',
        '/v1/requests',
        'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        'completed',
        201,
        '{"Content-Type": "application/json", "Location": "/v1/requests/req_01_open"}'::jsonb,
        '{"requestId":"req_01_open","status":"open"}',
        '2026-09-08 09:00:00+07',
        '2026-09-09 09:00:00+07',
        '2026-09-08 09:00:01+07'
    );

COMMIT;
