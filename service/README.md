| Operation | Served by | Remaining work |
| --- | --- | --- |
| `GET /v1/requests/{requestId}` | service | Contract test; verifikasi deployment. |
| `GET /v1/offers/{offerId}` | mock | semuanya |
| `GET /v1/assignments/{assignmentId}` | service | Contract test; verifikasi deployment. |
| `GET /v1/payments/{paymentId}` | mock | semuanya |
| `GET /v1/deliveries/{deliveryId}` | mock | semuanya |
| `GET /v1/receipt-confirmations/{confirmationId}` | mock | semuanya |
| `GET /v1/accounts/{accountId}` | mock | semuanya |
| `GET /v1/issues/{issueId}` | mock | semuanya |
| `GET /v1/requests` | service | Contract test; verifikasi deployment. |
| `GET /v1/requests/{requestId}/offers` | mock | semuanya |
| `GET /v1/deliveries/{deliveryId}/locations` | mock | semuanya |
| `GET /v1/issues` | mock | semuanya |
| `POST /v1/requests` | mock | semuanya (termasuk validasi Idempotency-Key) |
| `POST /v1/requests/{requestId}/offers` | mock | semuanya |
| `POST /v1/requests/{requestId}/assignments` | service | Verifikasi transaksi, replay, dan restart; contract test; deployment. |
| `POST /v1/assignments/{assignmentId}/payments` | mock | semuanya |
| `POST /v1/assignments/{assignmentId}/deliveries` | mock | semuanya |
| `POST /v1/deliveries/{deliveryId}/locations` | mock | semuanya |
| `POST /v1/deliveries/{deliveryId}/receipt-confirmations`| mock | semuanya |
| `POST /v1/issues` | mock | semuanya |
| `POST /v1/issues/{issueId}/resolutions` | mock | semuanya |

## P4 Step 2 - Kosakata scope

Status: rancangan akses untuk Step 2. Klasifikasi client tersedia pada
[ADR 0003](../docs/decisions/0003-autentikasi.md). Tabel status operasi P3 di atas
merupakan isi snapshot awal dan tidak diubah menjadi klaim kelulusan test.

### A. Aktor dan kemampuan

Aktor manusia berasal dari `components.schemas.AccountRole` pada `openapi.yaml`.
Tracker dan MCP ditambahkan sebagai konteks pemanggil teknis yang disebut dalam
kontrak dan dokumen domain, bukan role manusia baru.

| Aktor / konteks pemanggil | Kemampuan yang diperlukan |
| --- | --- |
| Pemesan (`requester`) | Membaca transaksi yang terkait dengannya; membuat permintaan; memilih satu penawaran; membayar secara simulasi; memantau pengantaran; mengonfirmasi penerimaan; membaca profil yang diizinkan; melaporkan masalah transaksi sendiri. |
| Jastiper (`jastiper`) | Membaca permintaan terbuka yang boleh ditawari dan transaksi yang melibatkannya; mengajukan penawaran setelah terverifikasi; membuat delivery untuk penugasan sendiri; mengirim lokasi; membaca profil yang diizinkan; melaporkan masalah penugasannya. |
| Admin (`admin`) | Membaca data operasional yang menjadi kewenangannya, termasuk masalah transaksi dan informasi pembayaran/komisi yang relevan; membaca profil yang diperlukan; mencatat penyelesaian masalah. |
| Tracking device / simulator | Mengirim koordinat dan waktu perekaman untuk delivery yang telah diikat oleh server pada identitas/perangkat tersebut. |
| MCP Operations Client pada server | Membaca transaksi dan masalah yang diizinkan untuk kebutuhan rekomendasi; tidak melakukan mutasi bisnis. |

Klien kelompok mitra menggunakan kemampuan aktor yang terautentikasi dan scope
registrasi client-nya. Status sebagai mitra tidak menambah kemampuan bisnis.

### B. Delapan scope yang digunakan

"Ya" berarti aktor boleh memperoleh scope tersebut; akses ke masing-masing objek
masih dibatasi oleh hubungan kepemilikan atau penugasan. Tanda "-" berarti tidak
boleh diberikan pada konteks tersebut.

| Scope | Izin dalam satu kalimat | Pemesan | Jastiper | Admin | Tracker | MCP |
| --- | --- | --- | --- | --- | --- | --- |
| `requests:read` | Membaca permintaan, penawaran, penugasan, pengantaran, lokasi, dan konfirmasi penerimaan yang boleh dilihat pemanggil. | Ya | Ya | Ya | - | Ya |
| `requests:write` | Menjalankan bagian alur transaksi milik pemesan: membuat permintaan, memilih penawaran, membayar simulasi, dan mengonfirmasi penerimaan. | Ya | - | - | - | - |
| `requests:fulfil` | Menjalankan bagian pemenuhan transaksi milik jastiper: mengajukan penawaran dan memulai pengantaran untuk penugasan sendiri. | - | Ya | - | - | - |
| `deliveries:write` | Mengirim pembaruan lokasi pengantaran yang ditugaskan kepada jastiper atau diikat pada perangkat pelacak. | - | Ya | - | Ya | - |
| `payments:read` | Membaca catatan pembayaran simulasi yang terkait dengan transaksi pemanggil atau untuk kebutuhan rekonsiliasi. | Ya | Ya | Ya | - | - |
| `accounts:read` | Membaca profil akun terbatas yang boleh dilihat pemanggil. | Ya | Ya | Ya | - | - |
| `issues:read` | Membaca daftar dan detail masalah transaksi dalam kewenangan operasional pemanggil. | - | - | Ya | - | Ya |
| `issues:write` | Melaporkan masalah transaksi oleh pemesan/jastiper atau mencatat penyelesaian masalah oleh admin yang berwenang. | Ya | Ya | Ya | - | - |

Resource `requests` memayungi entitas alur utama transaksi belanja Titipin
(permintaan, penawaran, penugasan, pengantaran, dan konfirmasi penerimaan).
Pemisahan antara `requests:write` dan `requests:fulfil` menegaskan batas
kewenangan: pemesan membuat permintaan, memilih penawaran, membayar, dan
mengonfirmasi penerimaan; sedangkan jastiper mengajukan penawaran serta
memulai pengantaran. Admin tidak mengambil alih alur transaksi normal ini.

`deliveries:write` dipisahkan khusus untuk pembaruan titik lokasi pengantaran
(`POST /v1/deliveries/{deliveryId}/locations`), sehingga token perangkat pelacak
(tracker) atau simulator hanya berwenang mengirim data telemetri lokasi tanpa
bisa memutasi data transaksi lainnya.

`payments:read` dialokasikan secara terpisah untuk membaca catatan pembayaran
simulasi, baik untuk pihak transaksi, admin, maupun kebutuhan job rekonsiliasi.

`issues:read` untuk admin dan MCP mengikuti deskripsi kontrak `GET /issues` dan
`GET /issues/{issueId}`. Pemesan dan jastiper menerima representasi issue dari
respons pembuatan `POST /v1/issues`, namun tidak diberikan akses ke daftar issue
administratif.

`issues:write` mencakup pelaporan masalah transaksi oleh pemesan/jastiper serta
pencatatan resolusi masalah oleh admin (`POST /v1/issues/{issueId}/resolutions`).
Pembedaan izin aksi resolusi tetap ditegakkan melalui role admin pada tingkat
pengecekan otorisasi objek/handler.

### C. Pemetaan seluruh operasi ke tepat satu scope

Path berikut merupakan URL runtime lengkap. Di dalam `openapi.yaml`, `/v1` sudah
berada pada `servers.url`, sehingga `paths` dimulai dengan `/requests`, dan
seterusnya. Jangan menambahkan `/v1` kedua ketika menerapkan Step 4.

| Method | Path runtime | Scope wajib |
| --- | --- | --- |
| GET | `/v1/requests` | `requests:read` |
| POST | `/v1/requests` | `requests:write` |
| GET | `/v1/requests/{requestId}` | `requests:read` |
| GET | `/v1/requests/{requestId}/offers` | `requests:read` |
| POST | `/v1/requests/{requestId}/offers` | `requests:fulfil` |
| GET | `/v1/offers/{offerId}` | `requests:read` |
| POST | `/v1/requests/{requestId}/assignments` | `requests:write` |
| GET | `/v1/assignments/{assignmentId}` | `requests:read` |
| POST | `/v1/assignments/{assignmentId}/payments` | `requests:write` |
| GET | `/v1/payments/{paymentId}` | `payments:read` |
| POST | `/v1/assignments/{assignmentId}/deliveries` | `requests:fulfil` |
| GET | `/v1/deliveries/{deliveryId}` | `requests:read` |
| GET | `/v1/deliveries/{deliveryId}/locations` | `requests:read` |
| POST | `/v1/deliveries/{deliveryId}/locations` | `deliveries:write` |
| POST | `/v1/deliveries/{deliveryId}/receipt-confirmations` | `requests:write` |
| GET | `/v1/receipt-confirmations/{confirmationId}` | `requests:read` |
| GET | `/v1/accounts/{accountId}` | `accounts:read` |
| GET | `/v1/issues` | `issues:read` |
| POST | `/v1/issues` | `issues:write` |
| GET | `/v1/issues/{issueId}` | `issues:read` |
| POST | `/v1/issues/{issueId}/resolutions` | `issues:write` |

`GET /health` adalah endpoint pemeriksaan proses yang tidak memuat data bisnis dan
tidak tercantum pada 21 operasi kontrak. Endpoint tersebut tetap publik.

### D. Batas pemberian scope dan akses objek

1. Authorization server nantinya membatasi scope berdasarkan pengguna/service
   account dan client terdaftar. Mengubah parameter scope pada aplikasi tidak
   boleh memberi izin tambahan.
2. Scope yang tercantum pada tabel C diperiksa sebelum query objek. Kekurangan
   scope menghasilkan `403`; token yang tidak ada atau tidak valid menghasilkan
   `401`.
3. Setelah scope lolos, handler memeriksa hubungan pemanggil dengan objek. Scope
   baca tidak berarti semua transaksi boleh dibaca. Objek yang tidak ada dan objek
   yang tidak boleh dilihat menghasilkan `404` yang tidak dapat dibedakan.
4. Pemesan hanya memilih offer, membayar, dan mengonfirmasi penerimaan untuk
   transaksi sendiri. Jastiper hanya membuat delivery untuk assignment miliknya.
   Pengajuan offer juga memerlukan status jastiper terverifikasi.
5. Jastiper memerlukan akses ke permintaan terbuka yang layak ditawari. Kebijakan
   ini harus ditulis eksplisit saat Step 8; mengharuskan semua request sudah
   ditugaskan kepadanya akan memutus alur pengajuan penawaran. Representasi untuk
   calon jastiper harus membatasi informasi yang belum diperlukan dan tetap
   mengikuti schema kontrak; perubahan bentuk respons harus diputuskan pada
   kontrak terlebih dahulu.
6. Token tracker dibatasi pada `deliveries:write`. Binding identitas/perangkat ke
   delivery merupakan data yang dipercaya server, bukan `deliveryId` kiriman
   client yang langsung dipercaya. Tracker tidak boleh memilih offer, membayar,
   membuat delivery, atau mengirim status transaksi. Transisi internal dari
   `pending` ke `in_transit` akibat lokasi pertama tetap merupakan aturan service
   yang sudah disebut kontrak.
7. MCP memakai principal pembaca operasional dengan `requests:read` dan
   `issues:read`. Ruang data dan field yang boleh dibaca tetap ditentukan server.
   Persetujuan admin terhadap rekomendasi tidak memberikan scope tulis kepada
   MCP; tindakan dilakukan melalui sesi admin yang berwenang.
8. Koleksi nantinya dibatasi di query SQL sebelum pagination. Pemeriksaan objek
   untuk operasi tulis dilakukan sebelum mutasi. Referensi objek di body, seperti
   `offerId` atau `assignmentId`, juga perlu diperiksa. Pencatatan resolusi
   (`POST /v1/issues/{issueId}/resolutions`) yang menggunakan `issues:write`
   hanya boleh dieksekusi oleh principal dengan role admin.

Butir D adalah keputusan rancangan untuk implementasi berikutnya, bukan laporan
bahwa pemeriksaan tersebut sudah ada dalam service.

### E. Checkpoint Step 2

- Kosakata memuat tepat 8 scope berbentuk `resource:action`.
- Setiap scope memiliki satu kalimat penjelasan dan pemberian izin yang jelas.
- Semua 21 operasi di `openapi.yaml` tercantum tepat satu kali pada tabel C.
- Setiap operasi memiliki tepat satu scope wajib.
- Pemesan, jastiper, admin, tracker, dan MCP memiliki batas kemampuan yang berbeda.
- Nama scope ini digunakan tanpa perubahan pada Step 3, Step 4, dan Step 7.

### F. Catatan untuk kelanjutan P4

Belum ada perubahan implementasi auth pada Step 1-2. Step berikutnya mengikuti
urutan modul: authorization server (3), deklarasi kontrak (4), struktur auth dan
konfigurasi (5), autentikasi (6), scope (7), kepemilikan objek (8), redaksi log (9),
rotasi/reuse refresh token (10), pengujian negatif (11), lalu CI dan penyerahan (12).

Temuan snapshot yang perlu dibawa saat implementasi:

- `package.json` memakai CommonJS; contoh `import` dari modul perlu disesuaikan
  dengan struktur proyek saat menulis kode auth.
- `npm test` masih placeholder; baseline P3 memakai
  `node --test tests/contract/*.test.cjs` dengan service dan database sudah aktif.
- `store/idempotency.js` masih menggunakan `anonymous:p3`. Pada tahap penerapan
  auth, namespace key harus mengikuti principal terverifikasi dan otorisasi juga
  berlaku sebelum respons replay dikembalikan.
- ID `sub` OIDC perlu dipetakan ke akun internal; jangan menganggapnya sama dengan
  ID seed.
- `info.description` pada kontrak menyebut titip barang dari luar negeri, sedangkan
  ADR domain membatasi jasa titip lokal. Catat penyelarasan deskripsi saat review
  kontrak, tanpa memperluas fitur secara diam-diam.

Tag `l4` dibuat setelah seluruh P4 selesai dan terbukti, bukan pada Step 2.
