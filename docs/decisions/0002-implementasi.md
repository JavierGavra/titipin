# 0002 — Implementasi service Titipin untuk P3

## Context

P3 membutuhkan service yang mengikuti kontrak, dapat diakses melalui URL
publik, menyimpan data secara persisten, dan mendukung retry operasi tulis
tanpa membuat entitas ganda.

Operasi tulis yang diprioritaskan adalah pemilihan offer melalui
POST /v1/requests/{requestId}/assignments.

## Decision

- Menggunakan Node.js 24, Express 5, CommonJS, dan PostgreSQL 18.
- Memisahkan routes, schemas, store, representations, dan Problem Details.
- Menempatkan SQL operasional di store serta DDL di service/db/schema.sql.
- Menjalankan service sebagai Web Service pada Render Free.
- Menyimpan database pada Neon Free menggunakan koneksi TLS terverifikasi.
- Mengambil konfigurasi dan kredensial melalui environment.
- Menjalankan schema secara eksplisit sebelum service digunakan.
- Menggunakan /health untuk memeriksa proses tanpa mengakses database.
- Mereservasi idempotency key sebelum transaksi bisnis.
- Menyimpan perubahan bisnis dan respons idempotency dalam satu transaksi.
- Menggunakan retensi key selama 24 jam.
- Menggunakan cakupan anonymous:p3 selama P3 belum memiliki autentikasi.
  Penyelarasan keputusan ini dengan kontrak dikoordinasikan bersama
  Contract & Integration Owner.

## Alternatives considered

- Penyimpanan dalam memori tidak dipilih karena data dan key akan hilang
  ketika proses berhenti.
- SQLite pada filesystem hosting sementara tidak dipilih karena
  penyimpanannya tidak bertahan pada setiap restart atau redeploy.
- Pengelolaan VPS sendiri tidak dipilih untuk tahap ini karena membutuhkan
  penyiapan sistem operasi dan administrasi tambahan.

## Consequences

- Data dan respons idempotency tetap berada di PostgreSQL ketika service
  direstart atau dideploy ulang.
- Koneksi database cloud membutuhkan TLS dan environment yang benar.
- Render Free dapat mengalami cold start setelah tidak menerima trafik.
- Seed dijalankan sebagai inisialisasi database demo, bukan saat startup.
- P3 hanya menggunakan data fiktif karena service belum memiliki autentikasi.
- Contract test dan penyelarasan spesifikasi tetap menjadi syarat
  penyelesaian setiap operasi.

## Verification

- [ ] Schema berhasil diterapkan pada database kosong.
- [ ] GET entitas dan koleksi berhasil melalui URL publik.
- [ ] POST menghasilkan 201, Location, dan entitas yang dapat dibaca.
- [ ] Retry identik tidak menambah jumlah assignment.
- [ ] Data dan replay tetap tersedia setelah restart service.
- [ ] Contract test terhadap service berhasil.