# ADR 0001: Pemilihan Domain Sistem Jasa Titip Komunitas Lokal

- **Status:** Accepted
- **Tanggal:** 2026-08-31

## Context

Proyek semester memerlukan domain yang memiliki minimal tiga aktor dengan hak akses berbeda, minimal satu operasi unsafe dan konsekuensial, minimal satu aktor yang bekerja dengan konektivitas tidak andal, serta cakupan satu alur kerja yang dapat diselesaikan sampai Pertemuan 14. Domain juga harus mendukung beberapa jenis klien dengan kendala berbeda dan menyediakan aturan bisnis yang dapat dinyatakan lebih dahulu melalui kontrak API sebelum service diimplementasikan.

Kelompok membutuhkan domain yang cukup kaya untuk membahas identitas, idempotency, operasi offline, desain error, perangkat terbatas, dan klien otonom, tetapi tidak berkembang menjadi marketplace atau sistem logistik lengkap. Domain harus dapat didemonstrasikan menggunakan pembayaran simulasi tanpa bergantung pada integrasi pihak ketiga.

## Decision

Kelompok memilih **Sistem Jasa Titip Komunitas Lokal (Titipin)**. Sistem mencakup satu alur pesanan jasa titip: pemesan membuat pesanan barang, jastiper terverifikasi mengajukan penawaran, pemesan memilih satu penawaran dan melakukan simulasi pembayaran, jastiper membeli serta mengantarkan barang, lalu pemesan mengonfirmasi penerimaan. Admin memantau transaksi bermasalah dan sistem menghitung komisi platform.

Tiga aktor utamanya adalah pemesan, jastiper, dan admin. Operasi pencatatan pembayaran menjadi operasi unsafe utama yang harus dilindungi dari pemrosesan ganda. Pemilihan penawaran juga harus dilakukan secara atomik karena satu pesanan hanya boleh memiliki satu penawaran terpilih dan satu jastiper aktif. Jastiper menjadi aktor dengan konektivitas intermiten ketika bekerja di lapangan.

Klien yang direncanakan adalah Web Client, Jastiper Mobile Client, Handover Verification Device, MCP Operations Client, dan Klien Kelompok Mitra. Device dan MCP hanya menjadi kanal berkewenangan terbatas bagi aktor yang sudah ada, bukan aktor bisnis baru atau alur kerja tambahan.

Cakupan versi pertama tidak mencakup pembayaran nyata melalui payment gateway, optimasi rute, pelacakan lokasi waktu nyata, chat, sistem reputasi, promosi, pengelolaan inventori penjual, pengiriman antarkota, atau penyelesaian sengketa yang kompleks. Verifikasi jastiper, pembayaran, dan komisi hanya dimodelkan sejauh diperlukan untuk mendukung alur utama.

## Alternatives considered

1. **Marketplace umum.** Alternatif ini menyediakan banyak aktor dan transaksi konsekuensial, tetapi cakupannya terlalu besar karena memerlukan katalog, inventori, pengelolaan banyak penjual, promosi, pembayaran, pengiriman, retur, dan sengketa. Kompleksitas tersebut berisiko menghalangi penyelesaian satu alur secara utuh.

2. **Sistem reservasi atau penjadwalan layanan.** Alternatif ini memiliki operasi pemesanan yang konsekuensial, tetapi sebagian besar aktornya bekerja di lokasi dengan konektivitas relatif stabil. Kebutuhan durable mutation queue dan operasi lapangan menjadi kurang kuat dibandingkan domain jasa titip.

3. **Sistem pengumpulan tugas.** Alternatif ini memiliki tenggat waktu dan operasi pengumpulan yang tidak boleh terduplikasi, tetapi variasi aktor, transaksi finansial, dan kebutuhan klien dengan sumber daya berbeda lebih terbatas. Domain tersebut memberikan lebih sedikit bahan untuk pembahasan idempotency, offline operation, device, dan klien otonom.

## Consequences

### Dampak positif

- Domain memenuhi kebutuhan tiga aktor, operasi unsafe, konektivitas intermiten, dan satu alur kerja end-to-end.
- Pencatatan pembayaran memberikan kasus yang jelas untuk `Idempotency-Key`, retry, dan pencegahan efek ganda.
- Pemilihan penawaran memberikan aturan bisnis yang membutuhkan pemeriksaan atomik dan respons konflik yang dapat diprediksi klien.
- Jastiper Mobile Client memberikan dasar untuk durable mutation queue dan sinkronisasi ketika jaringan kembali tersedia.
- Perbedaan Web, Mobile, Device, MCP, dan klien mitra menyediakan kendala autentikasi, latensi, sumber daya, serta kehadiran manusia yang berbeda.

### Dampak negatif dan kewajiban desain

- Kelompok harus menggunakan istilah `pesanan`, `penawaran`, `assignment`, `pembayaran`, dan `serah-terima` secara konsisten pada seluruh dokumen dan kontrak.
- Service harus menegakkan pemilihan penawaran secara atomik agar dua request bersamaan tidak menghasilkan dua jastiper aktif.
- Klien jastiper harus menyimpan mutasi tertunda dan menggunakan kembali idempotency key yang sama untuk retry dari maksud pengguna yang sama.
- Karena pembayaran hanya disimulasikan, dokumentasi tidak boleh mengklaim adanya settlement atau pembebanan dana nyata.
- Device dan MCP harus tetap berkewenangan terbatas agar tidak memperbesar alur bisnis utama atau menciptakan aktor tambahan.
- Fitur di luar cakupan hanya dapat ditambahkan melalui keputusan baru apabila tidak mengancam penyelesaian alur utama.
