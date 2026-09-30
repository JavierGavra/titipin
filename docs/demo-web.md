# Skenario demonstrasi aplikasi web

Gunakan alamat web hasil deployment, bukan alamat lokal, ketika melakukan demonstrasi.

1. Buka alamat tanpa login. Beranda dapat dibaca; saat membuka `/dashboard`, aplikasi mengarahkan ke login.
2. Masuk sebagai `requester-a`. Di dashboard, buat permintaan baru. Kosongkan satu kolom untuk menunjukkan pesan validasi di kolom tersebut, lalu kirim permintaan.
3. Buka URL `/requests/{requestId}` di tab baru. Halaman yang sama memuat ulang data dari service.
4. Masuk sebagai `jastiper-a` di tab lain, buka permintaan terbuka yang sama, dan kirim penawaran.
5. Kembali ke requester, buka detail permintaan, pilih penawaran, lalu buka URL assignment dan lakukan pembayaran simulasi.
6. Untuk konflik, buka detail request atau assignment di dua tab sebagai akun yang sama. Kirim aksi dari tab pertama, lalu kirim aksi yang sama dengan ETag lama di tab kedua. Tab kedua harus menampilkan bahwa data telah diproses lebih dulu dan memuat ulang data.
7. Untuk serangan console, masuk sebagai requester lalu kirim operasi jastiper secara manual:

   ```js
   fetch(`${window.__TITIPIN_CONFIG__.apiBaseUrl}/requests/req_01_open/offers`, {
     method: 'POST',
     headers: {
       Authorization: `Bearer ${JSON.parse(localStorage.getItem('titipin.web.session.v1')).accessToken}`,
       'Content-Type': 'application/json',
       'Idempotency-Key': crypto.randomUUID()
     },
     body: JSON.stringify({
       itemPrice: { amount: 120000, currency: 'IDR' },
       serviceFee: { amount: 10000, currency: 'IDR' },
       deliveryFee: { amount: 10000, currency: 'IDR' },
       estimatedArrivalAt: new Date(Date.now() + 86400000).toISOString(),
       stockCheckedAt: new Date().toISOString(),
       expiresAt: new Date(Date.now() + 3600000).toISOString(),
       note: 'Percobaan akses tanpa scope jastiper'
     })
   })
   ```

   Service harus menjawab `403`; menyembunyikan tombol saja tidak cukup.

## Akun uji lokal

Akun dibuat oleh `node infra/seed-auth.cjs`. Password dan kredensial tidak ditulis di repository; lihat `.local/auth-credentials.json` pada mesin yang menjalankan Keycloak.

| Akun | Role | Alur utama |
| --- | --- | --- |
| `requester-a` | requester | membuat request, memilih offer, membayar, konfirmasi receipt |
| `requester-b` | requester | data requester kedua untuk uji kepemilikan |
| `jastiper-a` | jastiper | melihat request terbuka, membuat offer, membuat delivery |
| `admin-a` | admin | membaca dan menyelesaikan laporan kendala |
