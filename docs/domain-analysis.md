# Analisis Domain Sistem Titipin

## A.2 Penetapan Domain

Titipin memungkinkan pemesan meminta pembelian barang dari toko atau area tertentu dengan spesifikasi, anggaran, alamat pengantaran, dan batas waktu. Jastiper terverifikasi di sekitar lokasi memeriksa stok lalu mengajukan penawaran; pemesan memilih satu dan melakukan pembayaran simulasi. Jastiper membeli serta mengantarkan barang, pemesan memantau pengantaran dan mengonfirmasi penerimaan, sedangkan admin menangani masalah dan komisi. Proses dapat gagal ketika permintaan kedaluwarsa, stok habis, penawaran sudah dipilih, pembayaran ditolak atau terduplikasi, jaringan jastiper terputus, atau penerimaan belum dikonfirmasi.

### Pemeriksaan Pemenuhan Syarat Domain

1. **Minimal tiga jenis aktor dengan hak akses berbeda - Terpenuhi.** Pemesan membuat permintaan, memilih penawaran, melakukan pembayaran simulasi, memantau pengantaran, dan mengonfirmasi penerimaan. Jastiper memeriksa stok, mengajukan penawaran, membeli barang, serta memperbarui status. Admin memverifikasi jastiper, memantau transaksi, dan menangani transaksi bermasalah tanpa mengambil alih kewenangan pemesan atau jastiper.

2. **Minimal satu operasi unsafe dan konsekuensial - Terpenuhi.** Pemilihan penawaran merupakan operasi konsekuensial karena satu permintaan hanya boleh mempunyai satu penawaran terpilih dan satu jastiper aktif. Request yang terkirim ulang tidak boleh membuat assignment kedua. Pembayaran simulasi juga tidak boleh tercatat dua kali karena dapat menggandakan nilai transaksi dan komisi.

3. **Minimal satu aktor bekerja dengan konektivitas tidak andal - Terpenuhi.** Jastiper bekerja secara berpindah-pindah ketika memeriksa stok, membeli, dan mengantarkan barang. Koneksi dapat terputus saat jastiper mengirim penawaran, bukti pembelian, lokasi, atau perubahan status. Aplikasi mobile harus menyimpan mutasi tertunda dan mengirimkannya kembali menggunakan idempotency key ketika jaringan tersedia.

4. **Cakupan cukup kecil untuk diselesaikan - Terpenuhi.** Sistem hanya menangani satu alur jasa titip lokal dari permintaan barang pada toko atau area yang ditentukan sampai konfirmasi penerimaan. Pembayaran, pengembalian dana, peta, dan komisi hanya disimulasikan sejauh diperlukan untuk mendukung alur utama; sistem tidak mencakup katalog penjual, pencarian ke banyak toko, negosiasi chat, gateway pembayaran nyata, optimasi rute, maupun penyelesaian sengketa penuh.

### Batas Cakupan

**Termasuk dalam cakupan:**

- pembuatan satu permintaan barang dari toko atau area yang ditentukan;
- pengajuan beberapa penawaran oleh jastiper terverifikasi;
- pemilihan tepat satu penawaran dan satu jastiper;
- pembayaran dan pengembalian dana secara simulasi;
- bukti pembelian atau bukti stok tidak tersedia;
- pembaruan status dan lokasi selama pengantaran;
- konfirmasi penerimaan oleh pemesan; dan
- pemantauan transaksi serta perhitungan komisi oleh admin.

**Tidak termasuk dalam cakupan:**

- katalog barang milik penjual dan pengelolaan inventori toko;
- kewajiban jastiper mencari barang ke banyak toko;
- pelacakan lokasi jastiper ketika memeriksa stok atau berbelanja;
- chat, tawar-menawar, ulasan, promosi, dan dompet digital;
- integrasi pembayaran, peta, atau logistik nyata; dan
- perangkat khusus untuk memverifikasi serah-terima barang.

## A.3 Taksonomi Lima Sumbu

| Klien yang direncanakan | Kemampuan menyimpan rahasia | Ketersediaan jaringan | Anggaran latensi | Batas sumber daya | Kehadiran manusia |
|---|---|---|---|---|---|
| **Admin Web Client** | Tidak dapat menyimpan client secret secara aman karena kode dan penyimpanan browser dikuasai pengguna. Diperlakukan sebagai public client dengan token berumur pendek. | Umumnya tersedia, tetapi koneksi dapat terputus ketika admin membaca atau memperbarui kasus transaksi. | Tampilan data ditargetkan tersedia dalam 2 detik; keputusan administratif ditargetkan mendapat kepastian dalam 5 detik. | Memori dan penyimpanan sedang, tetapi penyimpanan lokal tidak boleh menjadi sumber data utama dan penggunaan bandwidth tetap dibatasi. | Admin hadir untuk membaca alasan kegagalan dan memutuskan tindakan berikutnya. |
| **Titipin Mobile Client** | Tidak dapat menjamin rahasia berada di luar jangkauan pemilik perangkat sehingga tidak boleh menyimpan shared client secret. Token pengguna dapat ditempatkan pada penyimpanan aman perangkat dan harus dapat dicabut. | Intermiten, terutama ketika jastiper berada di toko atau dalam perjalanan. | Operasi konsekuensial ditargetkan mendapat kepastian server dalam 5 detik. Mutasi nonkritis dapat diantrikan sampai jaringan kembali, maksimal 30 menit. | Baterai, memori, penyimpanan, dan bandwidth terbatas. Hanya data permintaan aktif, mutasi tertunda, serta lokasi terakhir yang disimpan lokal. | Pemesan atau jastiper hadir untuk menafsirkan respons, tetapi sinkronisasi mutasi tertunda dapat berlangsung otomatis. Hak akses dan tampilan ditentukan oleh role akun. |
| **Delivery Tracking Device** | Kredensial unik perangkat dapat disimpan dalam keystore atau secure element, diberi kewenangan hanya untuk mengirim lokasi, dan dapat dicabut per perangkat. | Intermiten selama pengantaran; perangkat harus mampu menampung sejumlah kecil lokasi ketika koneksi hilang. | Lokasi baru ditargetkan terkirim dalam 10 detik ketika jaringan tersedia dan antrean dikirim kembali setelah koneksi pulih. | Memori, penyimpanan, daya, dan bandwidth sangat terbatas. Payload hanya memuat identifier assignment, koordinat, dan timestamp. | Tidak ada manusia yang menafsirkan setiap respons. Perangkat harus menangani hasil secara sederhana dan deterministik serta tidak boleh mengubah status transaksi. |
| **MCP Operations Client** | Dapat menyimpan kredensial terbatas di lingkungan server yang dikendalikan pengelola dan tidak dapat diakses pengguna akhir. | Diharapkan tersedia, tetapi harus menangani timeout dan gangguan service. | Satu permintaan ditargetkan selesai dalam 10 detik; pemeriksaan beberapa halaman dapat berlangsung sampai 60 detik. | Komputasi tersedia, tetapi biaya token, kuota API, dan ukuran context terbatas sehingga hasil harus ringkas dan dipaginasi. | Agen menafsirkan respons secara mandiri, tetapi hanya boleh membaca data dan membuat rekomendasi. Tindakan konsekuensial tetap memerlukan persetujuan admin. |
| **Klien Kelompok Mitra** | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. |

### Kesimpulan Taksonomi

1. Karena browser tidak dapat menjaga client secret dan admin hadir untuk menafsirkan kegagalan, **Admin Web Client** memerlukan public-client flow, token berumur pendek, dan Problem Details yang dapat dibaca manusia.
2. Karena jaringan pengguna lapangan intermiten dan mutasi dapat terkirim ulang, **Titipin Mobile Client** memerlukan durable mutation queue serta idempotency key yang dipertahankan untuk satu maksud pengguna.
3. Karena sumber daya perangkat sangat terbatas dan tidak ada manusia yang menafsirkan respons, **Delivery Tracking Device** memerlukan kredensial per perangkat, payload kecil, antrean terbatas, dan respons deterministik.
4. Karena agen menafsirkan respons secara mandiri dengan biaya context terbatas, **MCP Operations Client** memerlukan akses berprinsip least privilege, pagination, schema stabil, dan error bertipe jelas sebelum memberikan rekomendasi kepada admin.
5. Karena kendala **Klien Kelompok Mitra** belum diketahui, kontrak harus vendor-neutral, memiliki contoh lengkap, mendokumentasikan semua respons non-2xx, dan dapat dijalankan melalui mock server tanpa komunikasi tambahan.

## A.4 Dekomposisi Aturan Bisnis

### Aturan Bisnis yang Dipilih

> Satu permintaan hanya boleh memiliki satu penawaran terpilih dan satu jastiper aktif.

Aturan ini dipilih karena pelanggarannya dapat menyebabkan dua jastiper membeli barang yang sama, pembayaran atau pengembalian dana yang tidak konsisten, pengantaran ganda, dan perselisihan mengenai pihak yang berhak menerima biaya jasa.

| Lapisan | Peran terhadap aturan |
|---|---|
| **Service - menegakkan aturan** | Service menjadi satu-satunya lapisan yang menegakkan aturan secara otoritatif. Ketika menerima pemilihan penawaran, service melakukan pemeriksaan dan perubahan state secara atomik: permintaan harus berstatus `open`, penawaran harus masih aktif dan terkait dengan permintaan tersebut, serta belum ada penawaran terpilih. Jika valid, service mencatat `selectedOfferId` dan `assignedJastiperId`, lalu mengubah status permintaan menjadi `assigned`. Jika assignment telah ada, service menolak pembuatan assignment lain. |
| **Kontrak - menyatakan aturan** | Kontrak mendokumentasikan `POST /v1/requests/{requestId}/assignments` sebagai transisi `open` ke `assigned`. Operasi mewajibkan header `Idempotency-Key` berupa UUID versi 4, disimpan selama 24 jam, dan digunakan kembali untuk retry dari maksud yang sama. Keberhasilan menghasilkan `201 Created`. Jika penawaran lain telah dipilih, kontrak menyatakan `409 Conflict` dengan Problem Details bertipe `/problems/offer-already-selected`. Penggunaan key yang sama dengan body berbeda menghasilkan `409 Conflict` bertipe `/problems/idempotency-key-reuse`, sedangkan request asal yang masih diproses menghasilkan `409 Conflict` disertai `Retry-After`. Representasi permintaan menyediakan `status`, `selectedOfferId`, dan `assignedJastiperId` agar klien dapat memprediksi hasil. |
| **Klien - memprediksi aturan** | Klien hanya menampilkan tombol pemilihan ketika permintaan berstatus `open` dan penawaran masih aktif. Setelah pengguna mengonfirmasi, tombol dinonaktifkan sementara dan idempotency key yang sama digunakan untuk setiap retry. Jika menerima `409 Conflict`, klien menampilkan alasan penolakan dan memuat ulang permintaan. Pemeriksaan di klien hanya meningkatkan pengalaman pengguna dan tidak menjadi mekanisme pengamanan utama. |

Dengan pembagian tersebut, aturan bisnis ditegakkan tepat satu kali di service. Kontrak menyatakannya agar seluruh klien dapat memprediksi hasil, sedangkan klien tidak diberi kewenangan untuk menentukan kebenaran aturan.
