## Tabel Keputusan Resource

| Kandidat | Keputusan | Alasan |
|---|---|---|
| **Pemesan, jastiper, dan admin** | Diterima melalui resource Account | Setiap akun memiliki identifier accountId, tetap ada melintasi banyak transaksi, dan profil, role, atau status verifikasinya dapat berubah tanpa membuat ulang Request, Offer, Assignment, maupun Payment. Pemesan, jastiper, dan admin merupakan role, bukan tiga tipe resource pengguna yang terpisah. |
| **Request** | Diterima | Memiliki identifier `requestId`, tetap tersimpan sejak dibuat sampai mencapai status terminal, dan dapat berubah status tanpa membuat ulang Offer, Assignment, atau Payment. Request menjadi resource utama yang menyimpan kebutuhan barang, toko atau area, anggaran, alamat pengantaran, batas waktu, dan status proses. |
| **Offer** | Diterima | Memiliki identifier `offerId`, tetap tersimpan setelah diajukan, dan dapat berubah dari `active` menjadi `selected`, `withdrawn`, atau `expired` tanpa membuat ulang Request. Satu Request dapat menerima beberapa Offer. |
| **Assignment** | Diterima | Memiliki identifier assignmentId, tetap tersimpan setelah satu Offer dipilih, dan statusnya dapat berubah tanpa membuat ulang Request maupun Offer. Assignment mencatat hubungan antara satu Request, satu Offer terpilih, dan satu jastiper aktif. |
| **Payment** | Diterima | Memiliki identifier `paymentId`, tetap tersimpan setelah percobaan pembayaran selesai, dan statusnya dapat berubah menjadi `succeeded`, `failed`, atau `refunded` tanpa membuat ulang Assignment. Payment hanya merepresentasikan simulasi, bukan settlement dana nyata. |
| **Delivery** | Diterima sebagai resource Delivery | Memiliki identifier deliveryId, tetap tersedia selama dan setelah proses pengantaran, serta statusnya dapat berubah dari pending menjadi in_transit, delivered, atau confirmed tanpa membuat ulang Assignment. Delivery menjadi induk bagi LocationUpdate dan ReceiptConfirmation. |
| **Transaksi bermasalah** | Diterima sebagai resource TransactionIssue | Memiliki identifier issueId, tetap tersimpan sampai masalah selesai, dan status atau catatan penanganannya dapat berubah tanpa membuat ulang Request, Assignment, atau Payment. Cakupannya hanya kasus operasional sederhana, bukan sistem sengketa penuh. |
| **ReceiptConfirmation** | Diterima sebagai sub-resource | Memiliki identifier confirmationId dan deliveryId, tetap tersimpan sebagai bukti setelah pengantaran selesai, serta dapat dibuat tanpa membuat ulang Delivery. Hanya satu ReceiptConfirmation yang boleh berhasil untuk setiap Delivery. |
| **LocationUpdate** | Diterima sebagai sub-resource LocationUpdate | Setiap laporan memiliki identifier locationId, deliveryId, dan timestamp recordedAt, tetap tersimpan sebagai riwayat setelah request pengiriman lokasi dan proses pengantaran selesai, serta dapat ditambahkan tanpa membuat ulang Delivery. Payload dibatasi pada koordinat dan timestamp agar sesuai dengan perangkat bersumber daya terbatas. |
| **Barang** | Ditolak | Sistem tidak menyediakan katalog atau inventori. Barang tidak mempunyai identifier server dan hanya berupa `itemDescription`, `quantity`, serta spesifikasi pada Request. Masa hidupnya bergantung sepenuhnya pada Request. |
| **Toko atau area** | Ditolak | Toko atau area hanya menjadi nilai tujuan pada Request dan tidak dikelola sebagai direktori lokasi. Tidak ada lifecycle atau operasi mandiri untuk membuat dan memperbarui toko. |
| **Stok** | Ditolak | Ketersediaan stok merupakan observasi pada saat jastiper membuat Offer, bukan inventori yang dikelola sistem. Informasi tersebut cukup direpresentasikan melalui status, `stockCheckedAt`, dan bukti pada Offer. |

### Status Request

| Status | Makna |
|---|---|
| `open` | Permintaan tersedia untuk menerima penawaran. |
| `assigned` | Satu penawaran telah dipilih dan satu Assignment aktif telah dibuat. |
| `completed` | Pengantaran telah dikonfirmasi diterima oleh pemesan. |
| `expired` | Batas waktu permintaan berakhir sebelum Assignment terbentuk. |
| `cancelled` | Permintaan atau Assignment dibatalkan sesuai aturan yang diizinkan. |
| `unavailable` | Barang dinyatakan tidak tersedia dan pembayaran ditangani sesuai simulasi. |

Transisi utama:

```text
open -> assigned -> completed
```

Transisi terminal lainnya:

```text
open -> expired
open -> cancelled
assigned -> cancelled
assigned -> unavailable
```

Status `completed`, `expired`, `cancelled`, dan `unavailable` bersifat terminal.

Status keberhasilan pembayaran, pembelian barang, dan proses pengantaran tidak disimpan pada Request karena masing-masing sudah direpresentasikan oleh Payment, Assignment, dan Delivery.

### Status Offer

| Status | Makna |
|---|---|
| `active` | Penawaran masih aktif dan dapat dipilih oleh pemesan. |
| `selected` | Penawaran telah dipilih dan digunakan untuk membuat Assignment. |
| `withdrawn` | Penawaran ditarik kembali oleh jastiper sebelum dipilih. |
| `expired` | Penawaran tidak lagi berlaku karena melewati batas waktunya. |

Transisi yang diizinkan:

```text
active -> selected
active -> withdrawn
active -> expired
```

Status `selected`, `withdrawn`, dan `expired` bersifat terminal.

### Status Assignment

| Status | Makna |
|---|---|
| `active` | Penawaran telah dipilih dan jastiper aktif telah ditugaskan. |
| `purchased` | Jastiper telah membeli barang dan mencatat bukti pembelian. |
| `completed` | Delivery telah dikonfirmasi diterima oleh pemesan. |
| `cancelled` | Assignment dibatalkan sesuai aturan yang diizinkan. |
| `unavailable` | Barang dinyatakan tidak tersedia setelah Assignment dibuat. |

Transisi utama:

```text
active -> purchased -> completed
```

Transisi terminal lainnya:

```text
active -> cancelled
active -> unavailable
```

Status `completed`, `cancelled`, dan `unavailable` bersifat terminal.

### Status Payment

| Status | Makna |
|---|---|
| `pending` | Pembayaran simulasi sedang diproses. |
| `succeeded` | Pembayaran simulasi berhasil. |
| `declined` | Pembayaran simulasi ditolak. |
| `refunded` | Pembayaran simulasi yang sebelumnya berhasil telah dikembalikan. |

Transisi yang diizinkan:

```text
pending -> succeeded
pending -> declined
succeeded -> refunded
```

Status `declined` dan `refunded` bersifat terminal. Status `succeeded` masih dapat berubah menjadi `refunded` apabila transaksi dibatalkan atau barang dinyatakan tidak tersedia.

Gangguan teknis service tidak disimpan sebagai status `declined`, tetapi dikembalikan sebagai respons HTTP `5xx` dan ditangani klien sesuai kebijakan retry.

### Status Delivery

| Status | Makna |
|---|---|
| `pending` | Delivery telah dibuat, tetapi pengantaran belum dimulai. |
| `in_transit` | Barang sedang diantarkan dan LocationUpdate dapat dikirim. |
| `delivered` | Barang telah diserahkan, tetapi belum dikonfirmasi oleh pemesan. |
| `confirmed` | Pemesan telah membuat ReceiptConfirmation. |

Transisi yang diizinkan:

```text
pending -> in_transit -> delivered -> confirmed
```

Status `confirmed` bersifat terminal.

### Status TransactionIssue

| Status | Makna |
|---|---|
| `open` | Masalah transaksi telah tercatat dan menunggu penanganan admin. |
| `in_review` | Masalah sedang diperiksa oleh admin. |
| `resolved` | Masalah telah selesai ditangani. |

Transisi yang diizinkan:

```text
open -> in_review -> resolved
```

Status `resolved` bersifat terminal.

### Penanganan Nilai Enumeration yang Tidak Dikenal

Klien wajib menangani nilai enumeration yang tidak dikenal tanpa mengalami crash. Nilai status Request, Offer, Assignment, Payment, Delivery, atau TransactionIssue yang tidak dikenal harus diperlakukan sebagai kondisi belum terminal. Klien harus menonaktifkan tindakan konsekuensial dan memuat ulang representasi terbaru sebelum menawarkan tindakan kepada pengguna.

## Pemetaan Awal ke URI

Pemetaan berikut menjadi acuan bagi Contract Owner ketika menyusun `openapi.yaml`. Semua path menggunakan kata benda jamak, identifier opaque, dan penyarangan maksimal satu tingkat.

| Operasi domain | Method dan path | Catatan |
|---|---|---|
| Membuat permintaan | `POST /v1/requests` | Unsafe; wajib `Idempotency-Key` |
| Melihat koleksi permintaan | `GET /v1/requests?status=open&limit=10&cursor=...` | Filter dan pagination melalui query |
| Melihat satu permintaan | `GET /v1/requests/{requestId}` | Identitas ditempatkan pada path |
| Mengajukan penawaran | `POST /v1/requests/{requestId}/offers` | Unsafe; wajib `Idempotency-Key` |
| Melihat penawaran suatu permintaan | `GET /v1/requests/{requestId}/offers?status=active&limit=10&cursor=...` | Penyarangan satu tingkat |
| Melihat satu penawaran | `GET /v1/offers/{offerId}` | Identifier Offer bersifat opaque |
| Memilih penawaran | `POST /v1/requests/{requestId}/assignments` | Transisi `open` ke `assigned`; wajib `Idempotency-Key` |
| Melihat assignment | `GET /v1/assignments/{assignmentId}` | Mengembalikan referensi Request, Offer, dan jastiper |
| Membuat pembayaran simulasi | `POST /v1/assignments/{assignmentId}/payments` | Unsafe; wajib `Idempotency-Key` |
| Melihat pembayaran | `GET /v1/payments/{paymentId}` | Tidak mengeklaim settlement nyata |
| Membuat Delivery | `POST /v1/assignments/{assignmentId}/deliveries` | Dibuat setelah pembayaran berhasil dan pembelian tercatat; unsafe dan wajib `Idempotency-Key`. |
| Melihat Delivery | `GET /v1/deliveries/{deliveryId}` | Mengembalikan Assignment terkait, status pengantaran, dan lokasi terakhir. |
| Mengirim pembaruan lokasi | `POST /v1/deliveries/{deliveryId}/locations` | Device mengirim koordinat dan `recordedAt`; wajib `Idempotency-Key` agar retry tidak menggandakan LocationUpdate. |
| Melihat riwayat lokasi | `GET /v1/deliveries/{deliveryId}/locations?limit=20&cursor=...` | Mengembalikan koleksi LocationUpdate yang dipaginasi |
| Mengonfirmasi penerimaan | `POST /v1/deliveries/{deliveryId}/receipt-confirmations` | Unsafe; wajib `Idempotency-Key`; maksimal satu ReceiptConfirmation berhasil untuk satu Delivery. |
| Melihat konfirmasi penerimaan | `GET /v1/receipt-confirmations/{confirmationId}` | Identifier ReceiptConfirmation bersifat opaque dan respons memuat `deliveryId`. |
| Melihat satu akun | `GET /v1/accounts/{accountId}` | Identifier Account bersifat opaque; informasi yang dikembalikan dibatasi berdasarkan hak akses. |
| Membuat masalah transaksi | `POST /v1/issues` | Membuat TransactionIssue untuk penanganan admin; unsafe dan wajib `Idempotency-Key`. |
| Melihat koleksi masalah | `GET /v1/issues?status=open&limit=10&cursor=...` | Filter status dan pagination ditempatkan pada query. |
| Melihat satu masalah | `GET /v1/issues/{issueId}` | Mengembalikan status, catatan, dan referensi transaksi terkait. |
| Menyelesaikan masalah | `POST /v1/issues/{issueId}/resolutions` | Transisi melalui sub-resource; wajib `Idempotency-Key`. |

## Aturan Representasi

1. Nama field JSON menggunakan `camelCase`.
2. Nilai uang menggunakan integer dalam satuan minor disertai kode `currency`, misalnya `150000` dan `IDR`.
3. Timestamp menggunakan RFC 3339 dengan offset, misalnya `2026-09-04T18:00:00+07:00`.
4. Koleksi menggunakan `limit` dan `cursor` serta tidak boleh mengembalikan data tanpa batas.
5. Setiap schema memiliki array `required` dan example pada setiap properti.
6. Klien wajib mengabaikan field respons yang tidak dikenal.
7. Klien tidak boleh crash ketika menerima nilai enumeration yang tidak dikenal.
8. Setiap respons non-2xx menggunakan `application/problem+json` dengan URI `type` yang stabil dan contoh konkret.

