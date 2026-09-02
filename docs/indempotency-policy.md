# Kebijakan Safety dan Idempotency API Titipin

## Tujuan

Kebijakan ini mencegah satu maksud pengguna diproses lebih dari sekali ketika koneksi terputus, respons tidak diterima, atau klien mengirim ulang request dari durable mutation queue. Idempotency dinilai berdasarkan state akhir pada service, bukan berdasarkan kesamaan teks respons.

## Klasifikasi Method

| Method | Safe | Idempotent secara inheren | Kebijakan retry klien |
|---|---|---|---|
| `GET` | Ya | Ya | Boleh diulang karena tidak mengubah state. |
| `POST` | Tidak | Tidak | Hanya boleh diulang untuk maksud yang sama dengan `Idempotency-Key` yang sama dan body yang tidak berubah. |

Versi awal API Titipin tidak menggunakan `PUT`, `PATCH`, atau `DELETE`. Apabila method tersebut ditambahkan, sifat idempotensinya harus dinilai dan didokumentasikan sebelum dipublikasikan.

## Header dan Format Nilai

Semua operasi `POST` yang tercantum pada bagian berikut mewajibkan header:

```http
Idempotency-Key: 0f7c1b9e-3d21-4a6f-9c05-8e2b7d41a9f0
```

Nilainya harus berupa UUID versi 4 dalam bentuk kanonik bertanda hubung, yaitu `8-4-4-4-12` digit heksadesimal. Key dibangkitkan oleh klien ketika pengguna mengonfirmasi tindakan, bukan di dalam fungsi pengiriman jaringan. Klien menyimpan key bersama method, target URI, dan body pada durable mutation queue, lalu menggunakan kembali ketiganya tanpa perubahan sampai memperoleh hasil definitif.

Header yang hilang atau tidak sesuai format menghasilkan `400 Bad Request` dengan Problem Details bertipe `https://api.titipin.example/problems/invalid-idempotency-key`.

## Operasi yang Mewajibkan Idempotency-Key

| Operasi | Method dan URI | Konsekuensi apabila terproses dua kali |
|---|---|---|
| Membuat permintaan | `POST /v1/requests` | Terbentuk dua Request untuk satu kebutuhan pengguna. |
| Mengajukan penawaran | `POST /v1/requests/{requestId}/offers` | Terbentuk penawaran ganda dari jastiper yang sama. |
| Memilih penawaran | `POST /v1/requests/{requestId}/assignments` | Lebih dari satu Assignment atau jastiper dapat dianggap terpilih. |
| Membuat pembayaran simulasi | `POST /v1/assignments/{assignmentId}/payments` | Pembayaran dan komisi dapat tercatat lebih dari sekali. |
| Membuat pengantaran | `POST /v1/assignments/{assignmentId}/deliveries` | Terbentuk lebih dari satu Delivery untuk Assignment yang sama. |
| Mengirim pembaruan lokasi | `POST /v1/deliveries/{deliveryId}/locations` | Titik lokasi yang sama tercatat berulang pada riwayat. |
| Mengonfirmasi penerimaan | `POST /v1/deliveries/{deliveryId}/receipt-confirmations` | Konfirmasi penerimaan tercatat lebih dari sekali. |
| Mencatat masalah transaksi | `POST /v1/issues` | Admin menerima beberapa issue untuk kejadian yang sama. |
| Menyelesaikan masalah | `POST /v1/issues/{issueId}/resolutions` | Satu issue memiliki penyelesaian ganda. |

`Idempotency-Key` tidak diwajibkan dan diabaikan apabila dikirim pada operasi `GET`.

## Cakupan dan Jendela Retensi

Key dicatat dalam cakupan akun yang terautentikasi. Kombinasi akun dan key mengikat satu method, satu target URI, dan satu body request. Penggunaan key yang sama oleh akun yang sama untuk method, URI, atau body yang berbeda dianggap sebagai penggunaan ulang untuk maksud berbeda.

Service mempertahankan key beserta hasil request selama **24 jam sejak pertama kali key diterima**. Pengiriman ulang setelah masa retensi berakhir diperlakukan sebagai request baru. Karena itu, klien tidak boleh melakukan retry otomatis setelah 24 jam; klien harus lebih dahulu mengambil state resource terbaru atau meminta pengguna mengonfirmasi tindakan baru dengan key baru.

## Perilaku Server

| Kondisi | Perilaku server | Respons kepada klien |
|---|---|---|
| Key belum pernah diterima | Mencatat key, mengikatnya pada request, memproses request, dan menyimpan respons. | Respons asli, umumnya `201 Created`. |
| Key sudah diterima dan request identik telah selesai | Tidak menjalankan operasi lagi dan mengirimkan respons yang tersimpan. | Status, body, dan identifier sama dengan respons asli. |
| Key sudah diterima tetapi method, URI, atau body berbeda | Menolak request karena key telah digunakan untuk maksud lain. | `409 Conflict` dengan type `https://api.titipin.example/problems/idempotency-key-reuse`. |
| Key sudah diterima dan request identik masih diproses | Tidak menjalankan operasi kedua dan memberi petunjuk waktu retry. | `409 Conflict` dengan type `https://api.titipin.example/problems/idempotency-request-in-progress` serta header `Retry-After`. |

Contoh penggunaan key yang sama dengan body berbeda:

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://api.titipin.example/problems/idempotency-key-reuse",
  "title": "Idempotency key reused for a different request",
  "status": 409,
  "detail": "The supplied Idempotency-Key is already bound to another request.",
  "instance": "/v1/requests"
}
```

Contoh ketika request asal masih diproses:

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json
Retry-After: 2

{
  "type": "https://api.titipin.example/problems/idempotency-request-in-progress",
  "title": "The original request is still being processed",
  "status": 409,
  "detail": "Retry the same request after the number of seconds stated in Retry-After.",
  "instance": "/v1/assignments/asg_51Fa93cD/payments"
}
```

## Kewajiban Klien

1. Bangkitkan key satu kali saat pengguna mengonfirmasi tindakan.
2. Simpan key, method, URI, dan body bersama mutasi yang tertunda.
3. Gunakan kembali key dan body yang sama pada setiap retry untuk maksud tersebut.
4. Jangan membangkitkan key baru hanya karena terjadi timeout.
5. Hentikan retry otomatis ketika menerima respons final `2xx`, client fault `4xx`, atau domain rejection `409`/`422` yang bukan kondisi `idempotency-request-in-progress`.
6. Untuk `idempotency-request-in-progress`, tunggu sesuai `Retry-After`, kemudian ulangi request identik dengan key yang sama.
7. Setelah jendela 24 jam berakhir, periksa state resource sebelum menawarkan tindakan baru kepada pengguna.

Idempotency hanya mencegah pengulangan request dengan key yang sama. Aturan bisnis tetap ditegakkan secara terpisah. Sebagai contoh, percobaan membuat ReceiptConfirmation kedua dengan key baru tetap harus ditolak sebagai domain rejection karena satu Delivery hanya boleh mempunyai satu konfirmasi penerimaan.