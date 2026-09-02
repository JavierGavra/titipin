# ADR 0001: Pemilihan Domain dan Batas Sistem Titipin

- **Status:** Accepted
- **Tanggal:** 2026-09-01

## Context

Proyek semester memerlukan domain dengan minimal tiga aktor dan hak akses berbeda, minimal satu operasi unsafe dan konsekuensial, minimal satu aktor yang bekerja dengan konektivitas tidak andal, serta satu alur end-to-end yang cukup kecil untuk diselesaikan. Domain juga harus mendukung klien web, mobile, device, MCP, dan klien kelompok mitra dengan batas kemampuan yang berbeda, lalu dijelaskan melalui kontrak API sebelum service diimplementasikan.

Kelompok memilih masalah jasa titip lokal, tetapi perlu menghindari rancangan marketplace penjual lengkap yang memerlukan katalog, inventori, keranjang, promosi, dan retur. Pemesan juga tidak selalu mengetahui toko atau ketersediaan barang. Di sisi lain, tidak adil apabila semua jastiper harus mencari barang secara fisik sebelum salah satu dipilih, karena jastiper yang tidak terpilih mengeluarkan tenaga tanpa kompensasi.

Pencarian dan pengantaran dilakukan di lapangan dengan koneksi intermiten. Lokasi dapat meningkatkan akuntabilitas, tetapi pelacakan presisi terus-menerus selama pencarian menimbulkan risiko privasi, konsumsi baterai, dan kesan keliru bahwa GPS saja cukup membuktikan jastiper benar-benar memeriksa toko. Karena itu, cakupan lokasi harus dibedakan antara tahap pencarian dan pengantaran.

## Decision

Kelompok memilih **Titipin**, yaitu marketplace permintaan jasa titip lokal. Pemesan membuat `Request` yang memuat deskripsi dan jumlah barang, varian atau spesifikasi, anggaran maksimum, alamat pengantaran, tenggat, serta lokasi pembelian pilihan jika diketahui. Pemesan tidak wajib mengetahui toko atau stok barang dan sistem tidak mengelola inventori penjual.

Jastiper terverifikasi melihat feed permintaan dan mengajukan `Offer` awal berdasarkan pengetahuan atau pemeriksaan jarak jauh. Penawaran memisahkan `searchFee`, estimasi harga barang, `successFee`, dan `deliveryFee`. Pemesan memilih tepat satu penawaran secara atomik; hanya jastiper terpilih yang menerima `Assignment` dan boleh melakukan pencarian fisik.

Pembayaran hanya disimulasikan. Sistem mencatat otorisasi sampai batas biaya yang disetujui. Jika barang ditemukan dan transaksi selesai, komponen biaya direalisasikan sesuai tahapnya. Jika barang tidak ditemukan, permintaan berakhir `unfulfilled`; `searchFee` dapat dicatat sebagai layak dibayar apabila jastiper memiliki penugasan aktif serta check-in dan bukti pencarian yang valid, sedangkan estimasi harga barang, `successFee`, dan `deliveryFee` dibatalkan. Bukti meragukan berstatus `pending_review` dan memerlukan keputusan admin.

Pada tahap pencarian, jastiper membuka `SearchSession` dan membuat `SearchCheckIn` di toko yang diperiksa. Check-in memuat koordinat perkiraan, akurasi, waktu kejadian, hasil pencarian, catatan, dan bukti foto. Mutasi dapat disimpan sebagai `pending_sync` ketika offline dan dikirim kembali menggunakan idempotency key yang sama. Pemesan melihat progres dan lokasi perkiraan, bukan rute presisi terus-menerus.

Pada tahap pengantaran, jastiper dapat mengirim lokasi presisi secara berkala dan pemesan melihat lokasi terakhir dengan status `live`, `stale`, atau `unavailable`. Pengiriman lokasi berhenti otomatis ketika transaksi `completed`, `unfulfilled`, atau `cancelled`. Kontrak hanya menyatakan koordinat, akurasi, waktu, dan status; Google Maps atau penyedia peta lain menjadi pilihan implementasi klien, bukan ketergantungan domain maupun kontrak.


## Alternatives considered

1. **Marketplace penjual lengkap seperti Facebook Marketplace.** Tampilan feed permintaan dapat menyerupai marketplace, tetapi model penjual lengkap ditolak karena memerlukan Listing, Inventory, Cart, promosi, retur, dan pengelolaan banyak penjual. Unsur yang diambil hanya pola feed agar jastiper mudah menemukan permintaan yang relevan.

2. **Semua jastiper mencari barang sebelum pemesan memilih penawaran.** Alternatif ini ditolak karena beberapa jastiper dapat mendatangi toko untuk permintaan yang sama, sementara hanya satu yang menerima pekerjaan. Model yang dipilih membatasi pencarian fisik kepada jastiper yang sudah dipilih.

3. **Tidak memberikan biaya ketika barang tidak ditemukan.** Alternatif ini lebih sederhana, tetapi seluruh risiko ketersediaan stok dibebankan kepada jastiper. `searchFee` terbatas dipilih untuk mengompensasi usaha yang dapat dibuktikan tanpa membayar biaya keberhasilan atau pengantaran yang tidak terjadi.

4. **Pelacakan lokasi presisi terus-menerus sejak pencarian dimulai.** Alternatif ini ditolak karena boros baterai, mengganggu privasi, sulit diandalkan saat jaringan terputus, dan tidak cukup menjadi bukti kunjungan. Tahap pencarian menggunakan lokasi perkiraan dan check-in berbukti; lokasi presisi berkala hanya digunakan saat pengantaran.

5. **Mengikat API langsung ke Google Maps.** Alternatif ini ditolak agar kontrak tidak bergantung pada satu vendor, format SDK, kuota, atau kebijakan tertentu. Service menyimpan data lokasi yang netral terhadap penyedia, sedangkan klien bebas memilih lapisan peta.

## Consequences

### Dampak positif

- Domain memenuhi kebutuhan tiga aktor, operasi unsafe, konektivitas intermiten, dan satu alur end-to-end.
- Pemilihan satu penawaran memberikan aturan bisnis yang membutuhkan pemeriksaan atomik dan respons konflik yang dapat diprediksi.
- Pembayaran simulasi dan pemisahan komponen biaya menyediakan kasus yang jelas untuk idempotency serta pencegahan efek ganda.
- Pencarian hanya oleh jastiper terpilih dan `searchFee` berbukti membagi risiko stok secara lebih adil.
- `SearchSession`, check-in, dan lokasi pengantaran meningkatkan transparansi tanpa menyimpan pelacakan presisi sepanjang proses.
- Data lokasi yang netral terhadap vendor memungkinkan klien menggunakan Google Maps atau penyedia lain tanpa mengubah kontrak.

### Dampak negatif dan kewajiban desain

- Kelompok harus menggunakan istilah `Request`, `Offer`, `Assignment`, `SearchSession`, `SearchCheckIn`, pembayaran, pengantaran, dan serah-terima secara konsisten pada dokumentasi serta OpenAPI.
- Service harus menegakkan pemilihan penawaran secara atomik agar dua request bersamaan tidak menghasilkan dua jastiper aktif.
- Jastiper Mobile Client harus menyimpan mutasi tertunda, waktu kejadian, dan idempotency key agar retry tidak menghasilkan check-in atau perubahan status ganda.
- Check-in dan GPS tidak dapat dianggap sebagai bukti mutlak; bukti pencarian yang meragukan memerlukan status serta alur peninjauan admin.
- Penggunaan lokasi menambah kewajiban izin pengguna, pembatasan akses, retensi minimal, indikator data kedaluwarsa, dan penghentian pelacakan pada status terminal.
- Pemisahan komponen biaya menambah state transaksi, walaupun tidak ada pembebanan atau pencairan dana nyata.
- Cakupan awal tidak mencakup katalog dan inventori penjual, payment gateway nyata, chat, reputasi, navigasi, optimasi rute, riwayat rute lengkap, pengiriman antarkota, atau penyelesaian sengketa kompleks.
- Penambahan fitur di luar cakupan memerlukan keputusan baru agar alur utama tetap dapat diselesaikan.
