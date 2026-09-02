# Katalog Error API Titipin

## Tujuan dan Prinsip

Katalog ini mendefinisikan seluruh jenis kegagalan yang sengaja dipublikasikan oleh API Titipin. Pemilihan status code didasarkan pada tindakan yang harus dilakukan klien, bukan pada kemudahan implementasi service.

| Kategori | Status yang digunakan | Tindakan umum klien |
|---|---|---|
| Client fault | `400`, `401`, `403`, `404`, `422` | Jangan melakukan retry otomatis. Perbaiki request, kredensial, atau minta tindakan pengguna. |
| Domain rejection | `409`, `422` | Jangan melakukan retry request yang sama, kecuali kontrak secara eksplisit memberikan instruksi retry. Tampilkan alasan penolakan dan muat ulang state bila diperlukan. |
| Server fault | `500`, `503` | Retry dengan exponential backoff dan jitter. Jangan tampilkan detail internal kepada pengguna. |

Service tidak boleh mengembalikan `200 OK` dengan body seperti `{"success": false}` untuk menyatakan kegagalan. Penolakan aturan bisnis juga tidak boleh dikembalikan sebagai `500`, karena klien akan menganggapnya sebagai gangguan sementara dan melakukan retry yang tidak berguna.

## Format Problem Details

Setiap respons non-2xx menggunakan RFC 9457 Problem Details dengan header:

```http
Content-Type: application/problem+json
```

Semua Problem Details memiliki field dasar berikut.

| Field | Wajib | Ketentuan |
|---|---|---|
| `type` | Ya | URI stabil yang menjadi identitas jenis masalah dan dasar percabangan logika klien. |
| `title` | Ya | Ringkasan tetap untuk satu nilai `type`. Tidak memuat data kejadian. |
| `status` | Ya | Status HTTP yang sama dengan status pada response line. |
| `detail` | Ya | Keterangan spesifik untuk kejadian tanpa stack trace, SQL, hostname, atau detail internal. |
| `instance` | Ya | URI request atau kejadian spesifik yang mengalami kegagalan. |

Extension members hanya digunakan sesuai katalog. Klien wajib mengabaikan extension member yang tidak dikenal.

Base URI untuk seluruh jenis masalah adalah:

```text
https://api.titipin.example/problems/
```

Nilai `type` yang telah dipublikasikan tidak boleh diganti atau digunakan ulang untuk makna lain selama versi `v1` masih didukung.

## Katalog Client Fault

| Type | Status | Title tetap | Kondisi pemicu | Extension members | Tindakan klien |
|---|---:|---|---|---|---|
| `https://api.titipin.example/problems/invalid-request` | 400 | Invalid request | JSON tidak dapat diparse, query atau header tidak sesuai format, atau struktur request tidak dapat diproses. | `invalidParameters[]` berisi `name`, `location`, dan `reason`. | Perbaiki request; jangan retry request yang sama. |
| `https://api.titipin.example/problems/invalid-idempotency-key` | 400 | Invalid idempotency key | Operasi mewajibkan `Idempotency-Key`, tetapi header hilang atau bukan UUID v4 kanonik. | `headerName`. | Bangkitkan atau ambil kembali key yang benar dari durable mutation queue, lalu kirim ulang. |
| `https://api.titipin.example/problems/authentication-required` | 401 | Authentication required | Token tidak ada, tidak valid, kedaluwarsa, atau telah dicabut. | Tidak ada. | Hentikan request, perbarui autentikasi, lalu ulangi hanya setelah autentikasi berhasil. |
| `https://api.titipin.example/problems/forbidden` | 403 | Action is not permitted | Identitas sudah diketahui, tetapi role atau scope tidak mengizinkan operasi terhadap resource tersebut. | `requiredPermission`. | Sembunyikan tindakan yang tidak tersedia dan jangan melakukan retry otomatis. |
| `https://api.titipin.example/problems/resource-not-found` | 404 | Resource not found | Resource dengan identifier pada path tidak ditemukan atau tidak boleh diungkapkan kepada aktor tersebut. | `resourceType`, `resourceId`. | Hentikan retry dan muat ulang koleksi atau navigasikan pengguna kembali. |
| `https://api.titipin.example/problems/validation-failed` | 422 | Request validation failed | JSON valid, tetapi satu atau lebih nilai melanggar constraint schema, misalnya jumlah kurang dari satu atau batas waktu berada di masa lalu. | `errors[]` berisi `field`, `code`, dan `message`. | Tandai field terkait dan minta pengguna memperbaikinya. |

## Katalog Domain Rejection dan Idempotency

| Type | Status | Title tetap | Kondisi pemicu | Extension members | Tindakan klien |
|---|---:|---|---|---|---|
| `https://api.titipin.example/problems/invalid-state-transition` | 409 | State transition is not allowed | Request valid, tetapi resource tidak berada pada status yang mengizinkan tindakan tersebut. | `resourceType`, `resourceId`, `currentStatus`, `allowedStatuses[]`. | Jangan retry request yang sama; muat ulang resource dan perbarui kontrol antarmuka. |
| `https://api.titipin.example/problems/offer-already-selected` | 409 | An offer has already been selected | Pemesan mencoba membuat Assignment ketika Request telah memiliki Offer terpilih atau Assignment aktif. | `requestId`, `selectedOfferId`, `assignmentId`. | Tampilkan Assignment yang sudah terbentuk dan jangan membuat Assignment baru. |
| `https://api.titipin.example/problems/item-unavailable` | 409 | Requested item is unavailable | Jastiper menyatakan barang tidak tersedia setelah Assignment terbentuk. | `requestId`, `assignmentId`, `stockCheckedAt`. | Tampilkan kondisi barang dan muat ulang Payment untuk melihat status pengembalian dana simulasi. |
| `https://api.titipin.example/problems/payment-declined` | 422 | Payment was declined | Permintaan pembayaran valid, tetapi pembayaran simulasi ditolak. | `assignmentId`, `paymentId`, `reasonCode`. | Tampilkan alasan yang aman bagi pengguna dan minta pengguna mengonfirmasi percobaan pembayaran baru. |
| `https://api.titipin.example/problems/payment-not-succeeded` | 409 | Payment has not succeeded | Klien mencoba membuat Delivery sebelum Payment untuk Assignment berstatus `succeeded`. | `assignmentId`, `paymentId`, `paymentStatus`. | Jangan membuat Delivery; muat ulang Payment dan tunggu atau minta tindakan pengguna. |
| `https://api.titipin.example/problems/receipt-already-confirmed` | 409 | Delivery receipt has already been confirmed | ReceiptConfirmation telah tersedia untuk Delivery tersebut, tetapi klien mengirim maksud baru dengan key berbeda. | `deliveryId`, `confirmationId`, `confirmedAt`. | Gunakan konfirmasi yang sudah ada dan jangan meminta pengguna mengonfirmasi kembali. |
| `https://api.titipin.example/problems/issue-already-resolved` | 409 | Transaction issue is already resolved | Admin mencoba membuat Resolution baru pada TransactionIssue berstatus `resolved`. | `issueId`, `resolvedAt`. | Muat ulang issue dan tampilkan hasil penyelesaian yang sudah ada. |
| `https://api.titipin.example/problems/idempotency-key-reuse` | 409 | Idempotency key reused for a different request | Akun yang sama menggunakan key yang masih tersimpan untuk method, URI, atau body berbeda. | `originalRequestUri`. | Jangan retry dengan kombinasi tersebut; gunakan kembali request asli atau buat maksud baru dengan key baru. |
| `https://api.titipin.example/problems/idempotency-request-in-progress` | 409 | The original request is still being processed | Request identik dengan key yang sama diterima ketika request pertama belum selesai diproses. | `retryAfterSeconds`; response juga wajib memiliki header `Retry-After`. | Tunggu sesuai `Retry-After`, lalu kirim ulang request identik dengan key yang sama. |

## Katalog Server Fault

| Type | Status | Title tetap | Kondisi pemicu | Extension members | Tindakan klien |
|---|---:|---|---|---|---|
| `https://api.titipin.example/problems/internal-error` | 500 | An internal error occurred | Service gagal memproses request karena gangguan internal yang tidak diperkirakan. | Tidak ada detail internal. | Retry dengan exponential backoff dan jitter; tampilkan pesan umum jika tetap gagal. |
| `https://api.titipin.example/problems/service-unavailable` | 503 | Service is temporarily unavailable | Service sedang tidak siap atau ketergantungan penting sementara tidak tersedia. | `retryAfterSeconds`; gunakan header `Retry-After` jika waktu tersedia. | Tunggu, lalu retry dengan exponential backoff dan key yang sama untuk operasi idempoten terlindungi. |

## Pemetaan Error ke Operasi

Tabel berikut adalah daftar minimum error yang harus direferensikan oleh setiap operasi di `openapi.yaml`. `500 internal-error` dan `503 service-unavailable` berlaku untuk seluruh operasi meskipun tidak diulang pada setiap sel.

| Operasi | Problem type khusus yang perlu dicantumkan |
|---|---|
| `POST /v1/requests` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `validation-failed`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/requests` | `invalid-request`, `authentication-required`, `forbidden` |
| `GET /v1/requests/{requestId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/requests/{requestId}/offers` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `invalid-state-transition`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/requests/{requestId}/offers` | `invalid-request`, `authentication-required`, `forbidden`, `resource-not-found` |
| `GET /v1/offers/{offerId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/requests/{requestId}/assignments` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `invalid-state-transition`, `offer-already-selected`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/assignments/{assignmentId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/assignments/{assignmentId}/payments` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `invalid-state-transition`, `payment-declined`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/payments/{paymentId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/assignments/{assignmentId}/deliveries` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `invalid-state-transition`, `payment-not-succeeded`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/deliveries/{deliveryId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/deliveries/{deliveryId}/locations` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `invalid-state-transition`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/deliveries/{deliveryId}/locations` | `invalid-request`, `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/deliveries/{deliveryId}/receipt-confirmations` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `invalid-state-transition`, `receipt-already-confirmed`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/receipt-confirmations/{confirmationId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `GET /v1/accounts/{accountId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/issues` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `idempotency-key-reuse`, `idempotency-request-in-progress` |
| `GET /v1/issues` | `invalid-request`, `authentication-required`, `forbidden` |
| `GET /v1/issues/{issueId}` | `authentication-required`, `forbidden`, `resource-not-found` |
| `POST /v1/issues/{issueId}/resolutions` | `invalid-request`, `invalid-idempotency-key`, `authentication-required`, `forbidden`, `resource-not-found`, `validation-failed`, `invalid-state-transition`, `issue-already-resolved`, `idempotency-key-reuse`, `idempotency-request-in-progress` |

## Contoh Problem Details

Contoh domain rejection ketika satu penawaran telah dipilih:

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://api.titipin.example/problems/offer-already-selected",
  "title": "An offer has already been selected",
  "status": 409,
  "detail": "Request req_51Fa93cD already has a selected offer.",
  "instance": "/v1/requests/req_51Fa93cD/assignments",
  "requestId": "req_51Fa93cD",
  "selectedOfferId": "off_9Zx28LmQ",
  "assignmentId": "asg_3Bn71RtP"
}
```

Contoh validation error:

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://api.titipin.example/problems/validation-failed",
  "title": "Request validation failed",
  "status": 422,
  "detail": "One or more request fields are invalid.",
  "instance": "/v1/requests",
  "errors": [
    {
      "field": "quantity",
      "code": "minimum",
      "message": "quantity must be greater than or equal to 1"
    }
  ]
}
```

## Ketentuan Implementasi pada OpenAPI

1. Definisikan schema dasar `Problem` satu kali di `components/schemas`.
2. Definisikan minimal satu reusable response di `components/responses` dengan media type `application/problem+json`.
3. Setiap operasi mereferensikan seluruh status non-2xx yang dapat dihasilkannya.
4. Setiap response non-2xx menyediakan satu contoh konkret dengan `type` yang sesuai katalog.
5. Jangan mengubah `title`, status, arti extension members, atau tindakan klien untuk `type` yang sudah dipublikasikan pada `v1`.
6. Jangan memasukkan stack trace, query SQL, nama tabel, hostname, token, atau kredensial ke dalam `detail` maupun extension members.
