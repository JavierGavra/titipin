-- Titipin - struktur awal PostgreSQL untuk service/db/schema.sql.
-- Acuan: openapi.yaml versi 0.1.0 dan dokumen domain dalam titipin.zip.
-- Jalankan sekali pada database kosong dengan psql -v ON_ERROR_STOP=1 -1 -f.
-- Perubahan setelah struktur ini digunakan dibuat sebagai migrasi berikutnya.
-- File ini hanya membangun struktur. Data contoh berada di db/seed.sql.
--
-- Catatan untuk store/ dan representations/:
-- 1. ID dibuat service sebagai string opaque, misalnya req_..., bukan nomor urut.
-- 2. Kolom SQL memakai snake_case; JSON publik tetap camelCase sesuai kontrak.
-- 3. Store membaca selectedOfferId/assignedJastiperId dari assignments dengan
--    LEFT JOIN ke requests; nilainya null sebelum assignment dibuat.
-- 4. Delivery.lastLocation berasal dari location_updates; confirmedAt berasal
--    dari receipt_confirmations. TransactionIssue.resolution berasal dari
--    issue_resolutions. Representations menyusun objek bersarang secara eksplisit.
-- 5. Kolom currency pada offers berlaku untuk keempat objek Money; pada payments
--    berlaku untuk amount dan commission. Kontrak saat ini hanya menerima IDR.
-- 6. offers.total_amount dihitung otomatis; jangan mengisinya dalam INSERT seed.
-- 7. NUMERIC dibaca node-postgres sebagai string. Serialisasi nominal menjadi
--    integer JSON harus menjaga presisi; jangan langsung mengubah semua nilai
--    menjadi Number tanpa pemeriksaan rentang aman JavaScript.
-- 8. Default updated_at hanya berlaku saat INSERT. Store wajib memperbaruinya
--    pada setiap perubahan yang relevan bersama perubahan status dalam transaksi.
-- 9. Role, kepemilikan objek, deadline, transisi status, dan aturan lintas resource
--    diperiksa service; constraint di bawah melindungi integritas data tersimpan.

-- Money.amount: bilangan bulat nonnegatif tanpa batas maksimum buatan aplikasi.
-- NUMERIC tanpa precision/scale tidak membulatkan pecahan sebelum CHECK berjalan.
-- Pemeriksaan < Infinity sekaligus menolak Infinity dan NaN.
CREATE DOMAIN public.titipin_minor_amount AS NUMERIC
    CHECK (VALUE >= 0 AND VALUE < 'Infinity'::NUMERIC AND VALUE = trunc(VALUE));

CREATE TABLE public.accounts (
    account_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK (role IN ('requester', 'jastiper', 'admin')),
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified', 'pending', 'verified', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.requests (
    request_id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES public.accounts (account_id),
    item_description TEXT NOT NULL
        CHECK (char_length(item_description) BETWEEN 1 AND 500),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    target_store_or_area TEXT NOT NULL
        CHECK (char_length(target_store_or_area) BETWEEN 1 AND 300),
    budget_amount public.titipin_minor_amount NOT NULL,
    budget_currency TEXT NOT NULL DEFAULT 'IDR' CHECK (budget_currency = 'IDR'),
    delivery_address TEXT NOT NULL
        CHECK (char_length(delivery_address) BETWEEN 1 AND 500),
    deadline TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'assigned', 'completed', 'expired', 'cancelled', 'unavailable')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX requests_created_idx
    ON public.requests (created_at DESC, request_id DESC);
CREATE INDEX requests_status_created_idx
    ON public.requests (status, created_at DESC, request_id DESC);
CREATE INDEX requests_requester_idx ON public.requests (requester_id);

CREATE TABLE public.offers (
    offer_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES public.requests (request_id),
    jastiper_id TEXT NOT NULL REFERENCES public.accounts (account_id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'selected', 'withdrawn', 'expired')),
    item_price_amount public.titipin_minor_amount NOT NULL,
    service_fee_amount public.titipin_minor_amount NOT NULL,
    delivery_fee_amount public.titipin_minor_amount NOT NULL,
    total_amount public.titipin_minor_amount GENERATED ALWAYS AS
        (item_price_amount + service_fee_amount + delivery_fee_amount) STORED,
    currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
    estimated_arrival_at TIMESTAMPTZ NOT NULL,
    stock_checked_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    note TEXT CHECK (char_length(note) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Menjadi target foreign key gabungan pada assignments.
    CONSTRAINT offers_identity_request_jastiper_unique
        UNIQUE (offer_id, request_id, jastiper_id)
);

CREATE INDEX offers_request_created_idx
    ON public.offers (request_id, created_at DESC, offer_id DESC);
CREATE INDEX offers_request_status_created_idx
    ON public.offers (request_id, status, created_at DESC, offer_id DESC);
CREATE UNIQUE INDEX offers_one_selected_per_request
    ON public.offers (request_id) WHERE status = 'selected';

CREATE TABLE public.assignments (
    assignment_id TEXT PRIMARY KEY,
    -- Satu request tidak dapat memperoleh assignment kedua dengan key baru.
    request_id TEXT NOT NULL UNIQUE REFERENCES public.requests (request_id),
    offer_id TEXT NOT NULL,
    assigned_jastiper_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'purchased', 'completed', 'cancelled', 'unavailable')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    purchase_recorded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT assignments_offer_matches_request_and_jastiper
        FOREIGN KEY (offer_id, request_id, assigned_jastiper_id)
        REFERENCES public.offers (offer_id, request_id, jastiper_id),
    CONSTRAINT assignments_identity_request_unique
        UNIQUE (assignment_id, request_id)
);

CREATE TABLE public.payments (
    payment_id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES public.assignments (assignment_id),
    amount public.titipin_minor_amount NOT NULL,
    currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
    method TEXT NOT NULL
        CHECK (method IN ('simulated_card', 'simulated_bank_transfer')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'declined', 'refunded')),
    failure_reason_code TEXT,
    commission_amount public.titipin_minor_amount,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    refunded_at TIMESTAMPTZ,
    CONSTRAINT payments_identity_assignment_unique
        UNIQUE (payment_id, assignment_id)
);

-- Percobaan declined tetap tersimpan dan boleh diikuti percobaan baru.
-- Satu assignment hanya mempunyai satu pembayaran yang sedang diproses atau
-- pernah berhasil. Refund tidak menghapus riwayat keberhasilan tersebut.
CREATE UNIQUE INDEX payments_one_payable_attempt_per_assignment
    ON public.payments (assignment_id)
    WHERE status IN ('pending', 'succeeded', 'refunded');
CREATE INDEX payments_assignment_created_idx
    ON public.payments (assignment_id, created_at DESC, payment_id DESC);

CREATE TABLE public.deliveries (
    delivery_id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL UNIQUE REFERENCES public.assignments (assignment_id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_transit', 'delivered', 'confirmed')),
    delivery_address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    CONSTRAINT deliveries_identity_assignment_unique
        UNIQUE (delivery_id, assignment_id)
);

CREATE TABLE public.location_updates (
    location_id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL REFERENCES public.deliveries (delivery_id),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX location_updates_delivery_recorded_idx
    ON public.location_updates (delivery_id, recorded_at DESC, location_id DESC);

CREATE TABLE public.receipt_confirmations (
    confirmation_id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL UNIQUE REFERENCES public.deliveries (delivery_id),
    confirmed_by_account_id TEXT NOT NULL REFERENCES public.accounts (account_id),
    confirmed_at TIMESTAMPTZ NOT NULL,
    recipient_name TEXT NOT NULL CHECK (char_length(recipient_name) BETWEEN 1 AND 200),
    note TEXT CHECK (char_length(note) <= 500)
);

CREATE TABLE public.transaction_issues (
    issue_id TEXT PRIMARY KEY,
    created_by_account_id TEXT NOT NULL REFERENCES public.accounts (account_id),
    request_id TEXT NOT NULL,
    assignment_id TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    delivery_id TEXT,
    category TEXT NOT NULL
        CHECK (category IN ('payment', 'availability', 'delivery', 'receipt', 'other')),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Semua referensi dalam sebuah issue harus berasal dari transaksi yang sama.
    CONSTRAINT issues_assignment_matches_request
        FOREIGN KEY (assignment_id, request_id)
        REFERENCES public.assignments (assignment_id, request_id),
    CONSTRAINT issues_payment_matches_assignment
        FOREIGN KEY (payment_id, assignment_id)
        REFERENCES public.payments (payment_id, assignment_id),
    CONSTRAINT issues_delivery_matches_assignment
        FOREIGN KEY (delivery_id, assignment_id)
        REFERENCES public.deliveries (delivery_id, assignment_id)
);

CREATE INDEX transaction_issues_created_idx
    ON public.transaction_issues (created_at DESC, issue_id DESC);
CREATE INDEX transaction_issues_status_created_idx
    ON public.transaction_issues (status, created_at DESC, issue_id DESC);
CREATE INDEX transaction_issues_assignment_idx ON public.transaction_issues (assignment_id);

CREATE TABLE public.issue_resolutions (
    -- Sub-resource ini tidak memiliki resolutionId publik dalam kontrak.
    -- Primary key issue_id sekaligus membatasi satu penyelesaian per issue.
    issue_id TEXT PRIMARY KEY REFERENCES public.transaction_issues (issue_id),
    outcome TEXT NOT NULL
        CHECK (outcome IN ('delivery_restarted', 'payment_refunded', 'request_cancelled', 'no_action')),
    note TEXT NOT NULL CHECK (char_length(note) <= 1000),
    resolved_at TIMESTAMPTZ NOT NULL,
    resolved_by_account_id TEXT NOT NULL REFERENCES public.accounts (account_id)
);

-- Tabel internal: tidak dikirim sebagai representasi API.
-- Scope berasal dari identitas yang ditetapkan server. Cara menetapkan identitas
-- demo P3 dan autentikasi P4 perlu disepakati dengan Contract Owner; jangan
-- mempercayai actor_scope yang dikirim bebas oleh pemanggil.
-- Method dan URI sengaja tidak menjadi bagian primary key: key yang sama untuk
-- scope yang sama tetapi target/body berbeda harus terdeteksi sebagai reuse.
CREATE TABLE public.idempotency_keys (
    actor_scope TEXT NOT NULL CHECK (char_length(actor_scope) > 0),
    idempotency_key UUID NOT NULL,
    request_method TEXT NOT NULL CHECK (request_method = 'POST'),
    request_uri TEXT NOT NULL CHECK (char_length(request_uri) > 0),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    response_status INTEGER CHECK (response_status BETWEEN 200 AND 599),
    response_headers JSONB
        CHECK (response_headers IS NULL OR jsonb_typeof(response_headers) = 'object'),
    -- Teks JSON yang sudah diserialisasi menjaga body replay tetap identik,
    -- termasuk urutan field dan representasi angka pada respons pertama.
    response_body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (actor_scope, idempotency_key),
    CONSTRAINT idempotency_retention_24_hours
        CHECK (expires_at = created_at + INTERVAL '24 hours'),
    CONSTRAINT idempotency_response_matches_status CHECK (
        (status = 'in_progress'
            AND response_status IS NULL AND response_headers IS NULL
            AND response_body IS NULL AND completed_at IS NULL)
        OR
        (status = 'completed'
            AND response_status IS NOT NULL AND response_headers IS NOT NULL
            AND response_body IS NOT NULL AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idempotency_keys_expires_idx ON public.idempotency_keys (expires_at);

-- Panduan implementasi idempotency di store/:
-- * Format header UUID v4 kanonik tetap harus divalidasi schemas/ sebelum SQL.
-- * request_hash adalah SHA-256 dari body yang dikanonisasi secara konsisten.
-- * Bandingkan method, URI, dan hash untuk key yang masih dalam masa retensi.
-- * Simpan mutasi bisnis dan respons replay dalam satu transaksi agar kegagalan
--   sebelum COMMIT tidak meninggalkan mutasi tanpa respons yang bisa diputar ulang.
-- * Simpan header respons yang diperlukan (termasuk Location dan Content-Type),
--   dengan daftar yang diizinkan; jangan menyimpan token atau cookie autentikasi.
-- * Key kedaluwarsa harus ditangani secara atomik sebelum digunakan untuk maksud
--   baru. Index expires_at membantu pembersihan; tidak ada penghapusan otomatis.
-- * Tabel ini menyediakan penyimpanan; alur replay, konflik, dan retry masih harus
--   diimplementasikan serta diuji pada service.
