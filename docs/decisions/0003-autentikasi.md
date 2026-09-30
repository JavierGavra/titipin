# ADR 0003 - Autentikasi dan kontrol akses Titipin

Status: rancangan P4 Step 1-2; implementasi dan pembuktian Step 3-12 belum dilakukan.

## Context

Titipin menghubungkan pemesan, jastiper, dan admin dalam satu alur jasa titip: pemesan membuat permintaan, jastiper menawarkan jasa, pemesan memilih satu penawaran dan membayar secara simulasi, jastiper membeli serta mengantar barang, lalu pemesan mengonfirmasi penerimaan. Admin menangani masalah operasional.

Dasar rancangan adalah snapshot `titipin.zip`, `openapi.yaml` versi 0.1.1, `docs/decisions/0001-domain.md`, `docs/domain-analysis.md`, dan modul P4 halaman 3-6. Snapshot berada pada branch `l4-auth` dan memiliki tag `l1`, `l2`, serta `l3`. Hasil baseline P3 di laptop dan deployment harus tetap dicatat dari pelaksanaan Step 0; dokumen ini bukan bukti bahwa pemeriksaan tersebut sudah lulus.

Kontrak memuat 21 operasi. Kode service saat ini mengimplementasikan empat operasi domain: daftar request, detail request, pemilihan offer menjadi assignment, dan detail assignment. Autentikasi belum terpasang. `GET /health` merupakan pemeriksaan proses di luar 21 operasi kontrak.

Klien yang direncanakan adalah Admin Web Client, Titipin Mobile Client, Delivery Tracking Device, MCP Operations Client, dan klien kelompok mitra. Jenis klien ditentukan oleh kemampuan menjaga client secret, sedangkan role menentukan kewenangan aktor. Admin yang memakai browser tetap menggunakan public client.

## Decision

### 1. Klasifikasi klien dan alur memperoleh token

| Klien | Berjalan di | Public / Confidential | Flow | Menyimpan client secret? |
| --- | --- | --- | --- | --- |
| Admin Web Client (`titipin-web`) | Browser pengguna | Public | Authorization Code + PKCE S256 | Tidak |
| Titipin Mobile Client (`titipin-mobile`), untuk pemesan dan jastiper | Perangkat pengguna | Public | Authorization Code + PKCE S256 melalui browser sistem | Tidak |
| Delivery Tracking Device (`titipin-tracker`), rancangan awal berupa simulator dengan akses browser | Perangkat yang dikuasai pengguna | Public | Authorization Code + PKCE S256 saat aktivasi oleh jastiper | Tidak |
| MCP Operations Client (`titipin-mcp`) | Server yang dikelola kelompok, sebagai pembaca operasional | Confidential | Client Credentials menggunakan service account khusus | Ya, hanya di secret manager atau environment server saat runtime |
| Klien kelompok mitra (`titipin-partner`), baseline integrasi browser/native | Lingkungan mitra; kemampuan menjaga rahasia belum dibuktikan | Public sebagai baseline konservatif | Authorization Code + PKCE S256 | Tidak |

Nama client di atas merupakan rancangan registrasi, bukan client yang sudah dibuat di authorization server.

**Batas asumsi untuk tracker.** Simulator dipilih sebagai rancangan awal agar login dapat dilakukan melalui browser dan callback. Token tracker hanya boleh membawa `deliveries:write`, serta terikat pada jastiper dan delivery yang diizinkan server. Jangan menyalin token mobile dengan seluruh kewenangan jastiper. Perangkat fisik headless belum tercakup oleh mekanisme login simulator; sebelum integrasi perangkat tersebut, evaluasi kembali flow aktivasi dan pembuktian perlindungan kredensial dalam ADR ini. Keberadaan keystore saja tidak membuktikan bahwa sebuah shared client secret aman dari pemilik perangkat. Rancangan ini memperjelas asumsi kredensial perangkat dalam dokumen P2.

**Batas asumsi untuk MCP.** Client Credentials berlaku untuk proses pembaca di server kelompok. Secret tidak dikirim ke model, tool arguments, browser, atau aplikasi desktop pengguna. Jika MCP kelak bertindak atas nama pengguna atau dipindahkan ke perangkat pengguna, rancangan autentikasi harus ditinjau kembali sebelum dipakai. Keputusan ini mengatur koneksi MCP Operations Client ke API Titipin; autentikasi masuk ke server MCP merupakan batas yang berbeda.

**Batas asumsi untuk mitra.** Public merupakan baseline yang diizinkan sekarang, bukan klaim bahwa teknologi mitra sudah diketahui. Registrasi produksi menunggu redirect URI dan arsitektur mitra yang nyata. Implementasi server milik mitra hanya dapat memperoleh registrasi confidential tersendiri setelah kemampuan menyimpan secret dibuktikan. Mitra tidak diberi role bisnis baru atau hak tambahan hanya karena merupakan mitra.

Tidak ada scheduled job terpisah yang dinyatakan dalam domain saat ini. Contoh job pada modul tidak menambah fitur rekonsiliasi secara otomatis; kebutuhan machine-to-machine yang sudah direncanakan dipenuhi MCP reader.

### 2. Ketentuan public client

1. Gunakan Authorization Code + PKCE dengan metode S256 dan tanpa client secret.
2. Buat verifier acak untuk setiap login, kirim challenge-nya saat meminta authorization code, dan gunakan verifier saat menukar code.
3. Buat `state` acak, simpan sampai callback diterima, lalu cocokkan nilainya.
4. Daftarkan redirect URI secara lengkap sesuai aplikasi; jangan memakai wildcard.
5. Access token dan refresh token tidak ditempatkan di URL, log, atau repository.
6. Public client boleh memiliki token pengguna; kolom "Tidak" pada tabel berarti tidak menyimpan OAuth client secret, bukan berarti tidak memiliki kredensial pengguna sama sekali.

Aturan native public client dan PKCE sejalan dengan [RFC 8252 bagian 6 dan 8](https://www.rfc-editor.org/rfc/rfc8252.html).

### 3. Aktor, scope, dan pembatasan pemberian izin

Role manusia mengikuti `AccountRole` pada kontrak: `requester`, `jastiper`, dan `admin`. Tracker dan MCP adalah konteks pemanggil teknis; keduanya tidak ditambahkan ke enum role akun pada Step 1-2.

Kosakata yang dipilih:

- `requests:read`
- `requests:write`
- `requests:fulfil`
- `deliveries:write`
- `payments:read`
- `accounts:read`
- `issues:read`
- `issues:write`

Tabel kemampuan, matriks pemberian scope, dan pemetaan lengkap 21 operasi disimpan di [service/README.md](../../service/README.md), bagian "P4 Step 2 - Kosakata scope". Bagian tersebut menjadi acuan utama agar salinan tabel tidak berbeda.

Resource `requests` memayungi entitas alur utama transaksi belanja Titipin (permintaan, penawaran, penugasan, pengantaran, dan konfirmasi penerimaan). `requests:write` khusus untuk tindakan pemesan (membuat permintaan, memilih penawaran, membayar simulasi, dan mengonfirmasi penerimaan); `requests:fulfil` khusus untuk tindakan pemenuhan jastiper (mengajukan penawaran dan memulai pengantaran). `deliveries:write` dipisahkan khusus untuk pengiriman lokasi pengantaran oleh jastiper atau perangkat pelacak. `payments:read` dialokasikan untuk membaca catatan pembayaran simulasi atau kebutuhan rekonsiliasi. Pelaporan masalah transaksi dan pencatatan resolusinya dicakup dalam `issues:write`, dengan pembatasan resolusi khusus bagi admin pada tingkat handler objek.

Authorization server nantinya hanya menerbitkan irisan scope yang diminta, yang diizinkan untuk client terdaftar, dan yang berhak diperoleh pengguna atau service account. Public client tidak dapat menaikkan haknya hanya dengan mengubah parameter `scope`. MCP mendapat akses baca terbatas (`requests:read` dan `issues:read`); tracker mendapat `deliveries:write` saja.

Scope mengizinkan jenis operasi, bukan semua objek. Hubungan principal dengan pemilik request, pembuat offer, jastiper yang ditugaskan, dan delivery tetap diperiksa terpisah pada Step 8. Urutannya: autentikasi token, pemeriksaan scope, lalu pemeriksaan objek sebelum perubahan data.

### 4. Keputusan pendukung untuk tahap berikutnya

- Authorization server: rencana menggunakan Keycloak sesuai bentuk contoh modul. Penyiapan dilakukan pada Step 3. Dukungan rotasi refresh token dan pencabutan seluruh keluarga token setelah reuse wajib dibuktikan pada Step 10; belum dianggap terverifikasi.
- Strategi token pengujian: key pair khusus test dan JWKS lokal pada proses pengujian. Pengujian otorisasi service di CI tidak bergantung pada authorization server publik. Strategi ini diterapkan pada Step 11.
- Resource server: service Titipin memverifikasi access token dan tidak menerima password atau menerbitkan token sendiri.
- Pemetaan identitas OIDC ke `accounts.account_id` perlu ditetapkan saat implementasi; `sub` dari penyedia identitas tidak diasumsikan sama dengan ID akun seed.

## Alternatives considered

- Menaruh client secret pada browser, mobile, atau firmware tracker ditolak karena pengguna menguasai lingkungan eksekusinya.
- Menyamakan role admin dengan confidential client ditolak karena role dan kemampuan aplikasi menjaga secret merupakan dua hal berbeda.
- Memberi tracker `requests:fulfil` ditolak karena scope tersebut juga mengizinkan penawaran dan pembuatan delivery. Tracker hanya memerlukan pengiriman lokasi via `deliveries:write`.
- Memberi MCP token admin penuh ditolak karena kebutuhan yang tercatat hanya membaca data dan menyusun rekomendasi.
- Membuat scope terpisah untuk setiap endpoint ditolak karena modul membatasi kosakata hingga delapan scope dan meminta pengelompokan berdasarkan kemampuan aktor.
- Mengizinkan akses objek hanya berdasarkan scope ditolak karena caller dapat mengganti identifier pada request.

## Consequences

Step 1 menghasilkan klasifikasi lima kelompok klien. Step 2 menghasilkan delapan scope dan satu scope untuk setiap operasi kontrak. Seluruh public client tidak menyimpan client secret.

Implementasi berikutnya harus menggunakan nama scope yang sama pada authorization server, `openapi.yaml`, dan middleware. Operasi yang masih memakai mock tetap memiliki rancangan akses, tetapi keberadaan tabel bukan bukti bahwa endpoint tersebut sudah diimplementasikan.

Saat token tidak ada atau tidak valid, respons adalah `401`. Saat token valid tetapi scope kurang, respons adalah `403` sebelum akses objek. Objek yang tidak ada dan objek yang tidak boleh dilihat menghasilkan respons `404` yang tidak dapat dibedakan menurut ketentuan P4.

Step 1-2 selesai pada tingkat rancangan dokumen. Bukti rotasi/reuse refresh token, implementasi tiga lapisan pemeriksaan, pengujian negatif, hasil CI, dan tag `l4` tetap menunggu tahap masing-masing.
