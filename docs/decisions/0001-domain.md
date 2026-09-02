# ADR 0001: Pemilihan Domain Titipin

- **Status:** Accepted
- **Tanggal:** 2026-09-02

## Context

Proyek semester memerlukan satu service yang dikonsumsi oleh beberapa klien dengan kendala berbeda: browser, perangkat mobile dengan jaringan intermiten, perangkat terbatas, agen MCP, dan klien kelompok mitra yang belum diketahui. Domain juga harus mempunyai minimal tiga aktor dengan hak akses berbeda, minimal satu operasi unsafe dan konsekuensial, minimal satu aktor di luar konektivitas andal, serta satu alur kerja yang dapat diselesaikan secara utuh oleh tiga anggota kelompok.

Gagasan jasa titip umum semula memungkinkan jastiper mencari barang ke banyak toko, melaporkan beberapa titik pencarian, menerima biaya pencarian, dan menjalani proses sengketa apabila barang tidak ditemukan. Cakupan tersebut menambah state, aturan pembayaran, data lokasi, bukti, dan jalur kegagalan yang tidak diperlukan untuk membuktikan tujuan utama tugas.

## Decision

Kelompok memilih domain **Titipin - jasa titip lokal dari toko atau area yang ditentukan**.

Pemesan membuat permintaan yang menyebutkan barang, toko atau area tujuan, anggaran, alamat pengantaran, dan batas waktu. Jastiper terverifikasi yang berada di sekitar lokasi dapat memeriksa stok dan mengajukan penawaran berisi harga barang, biaya jasa, biaya pengantaran, serta perkiraan waktu tiba. Pemesan memilih tepat satu penawaran dan melakukan pembayaran simulasi. Jastiper membeli dan mengantarkan barang, pemesan mengonfirmasi penerimaan, sedangkan admin memantau transaksi bermasalah dan komisi.

Cakupan dibatasi sebagai berikut:

- hanya satu penawaran dapat dipilih untuk setiap permintaan;
- jastiper memilih sendiri permintaan yang sesuai dengan lokasi atau rutenya;
- jastiper tidak diwajibkan mencari barang ke banyak toko;
- lokasi hanya dikirim selama tahap pengantaran;
- pembayaran, pengembalian dana, peta, dan komisi menggunakan simulasi;
- tidak ada chat, katalog penjual, optimasi rute, ulasan, dompet digital, atau penyelesaian sengketa penuh; dan
- perangkat terbatas hanya bertindak sebagai delivery tracking device dan tidak berwenang memilih penawaran, membayar, atau mengubah status transaksi.

Klien yang direncanakan adalah Admin Web Client, Titipin Mobile Client dengan tampilan berbasis role pemesan atau jastiper, Delivery Tracking Device, MCP Operations Client, dan Klien Kelompok Mitra.

## Alternatives considered

### 1. Jasa titip dengan pencarian ke banyak toko

Alternatif ini ditolak karena memerlukan sesi pencarian, beberapa check-in, biaya pencarian, bukti untuk setiap toko, aturan kompensasi ketika barang tidak ditemukan, dan penanganan sengketa yang lebih luas. Kompleksitas tersebut terlalu besar untuk satu alur utama yang dikerjakan tiga orang.

### 2. Marketplace dengan katalog dan stok milik penjual

Alternatif ini ditolak karena mengubah domain menjadi e-commerce umum dan membutuhkan aktor penjual, pengelolaan katalog, inventori, keranjang, serta sinkronisasi stok. Selain memperbesar cakupan, peran jastiper sebagai aktor lapangan menjadi kurang penting.

### 3. Perangkat khusus untuk verifikasi serah-terima

Alternatif ini ditolak karena pemesan sudah dapat mengonfirmasi penerimaan melalui aplikasi mobile. Menjadikan perangkat tambahan sebagai syarat transaksi akan menciptakan ketergantungan baru dan berpotensi menghambat penyelesaian ketika perangkat tidak tersedia. Kebutuhan klien terbatas dipenuhi melalui delivery tracking device yang hanya mengirim lokasi selama pengantaran.

## Consequences

Konsekuensi positif:

- domain memenuhi kebutuhan aktor, operasi konsekuensial, konektivitas intermiten, dan variasi klien;
- alur utama lebih pendek dan dapat diuji dari permintaan sampai konfirmasi penerimaan;
- beban jastiper dibatasi karena jastiper hanya mengambil permintaan yang sesuai lokasi atau rutenya;
- aturan terpenting dapat dinyatakan jelas: satu permintaan hanya memiliki satu penawaran terpilih dan satu jastiper aktif; dan
- kontrak tetap independen dari penyedia peta, pembayaran, framework, maupun teknologi klien.

Konsekuensi negatif dan trade-off:

- pemesan harus mengetahui setidaknya toko atau area tempat barang kemungkinan tersedia;
- informasi stok dari jastiper hanya benar pada waktu pemeriksaan dan dapat berubah sebelum pembelian;
- pelacakan lokasi tidak menjamin barang tersedia atau transaksi berhasil;
- pembayaran dan pengembalian dana belum mewakili perilaku penyedia pembayaran nyata; dan
- satu aplikasi mobile dengan dua role membutuhkan pengujian otorisasi agar pemesan dan jastiper tidak dapat menjalankan tindakan milik role lain.
