# Analisis Domain Sistem Titipin

## A.2 Penetapan Domain

Sistem Jasa Titip Komunitas Lokal memungkinkan pemesan membuat pesanan barang dengan lokasi, anggaran, dan batas waktu. Jastiper terverifikasi mengajukan penawaran; pemesan memilih satu dan melakukan simulasi pembayaran. Setelah pembayaran tercatat, jastiper membeli dan mengantarkan barang, pemesan mengonfirmasi penerimaan, admin memantau transaksi bermasalah, dan sistem menghitung komisi. Proses dapat gagal jika pesanan kedaluwarsa atau sudah memiliki penawaran terpilih, barang tidak tersedia, pembayaran ditolak atau tercatat ganda, koneksi jastiper terputus, atau penerimaan belum dikonfirmasi.

### Pemeriksaan Pemenuhan Syarat Domain

1. **Minimal tiga jenis aktor dengan hak akses berbeda - Terpenuhi.** Pemesan membuat pesanan, memilih penawaran, melakukan simulasi pembayaran, dan mengonfirmasi penerimaan. Jastiper mengajukan penawaran, membeli barang, mengunggah bukti pembelian, serta memperbarui status pengantaran. Admin memantau transaksi dan menangani transaksi bermasalah tanpa mengambil alih kewenangan pemesan atau jastiper.

2. **Minimal satu operasi unsafe dan konsekuensial - Terpenuhi.** Pencatatan pembayaran merupakan operasi unsafe yang tidak boleh diproses dua kali. Pemrosesan request yang sama lebih dari sekali dapat membuat catatan pembayaran ganda, menjalankan transisi transaksi berulang, dan menghitung komisi lebih dari sekali. Karena itu, operasi tersebut memerlukan perlindungan idempotency agar satu maksud pembayaran hanya menghasilkan satu perubahan transaksi.

3. **Minimal satu aktor bekerja dengan konektivitas tidak andal - Terpenuhi.** Jastiper bekerja secara berpindah-pindah ketika membeli dan mengantarkan barang sehingga dapat mengalami jaringan intermiten saat menerima pesanan, mengunggah bukti pembelian, atau memperbarui status pengantaran. Klien jastiper harus mampu menyimpan mutasi yang tertunda dan mengirimkannya kembali ketika koneksi tersedia.

4. **Cakupan cukup kecil untuk diselesaikan - Terpenuhi.** Sistem dibatasi pada satu alur pesanan jasa titip lokal dari pembuatan pesanan, pemilihan satu penawaran, simulasi pembayaran, pembelian dan pengantaran barang, hingga konfirmasi penerimaan serta perhitungan komisi platform. Verifikasi jastiper, pembayaran, dan komisi hanya dimodelkan sejauh diperlukan untuk mendukung alur utama tersebut.

## A.3 Taksonomi Lima Sumbu

Klien yang direncanakan terdiri atas Web Client untuk pemesan dan admin, Jastiper Mobile Client untuk jastiper di lapangan, Handover Verification Device untuk pencatatan serah-terima, MCP Operations Client untuk membantu peninjauan administratif, serta Klien Kelompok Mitra yang karakteristiknya belum diketahui. Device dan MCP bukan aktor bisnis baru; keduanya hanya menjadi kanal dengan kewenangan terbatas bagi aktor yang sudah ada.

| Klien | Kemampuan menyimpan rahasia | Ketersediaan jaringan | Anggaran latensi | Batas sumber daya | Kehadiran manusia |
| --- | --- | --- | --- | --- | --- |
| **Web Client** | Tidak dapat menyimpan `client secret` secara aman karena kode dan penyimpanan browser berada dalam kendali pengguna. Diperlakukan sebagai public client dengan token berumur pendek. | Umumnya tersedia, tetapi koneksi dapat terputus ketika pesanan atau pembayaran dikirim. | Tampilan data ditargetkan maksimal 2 detik; operasi interaktif dan konsekuensial harus memperoleh kepastian maksimal 5 detik. | Memori dan penyimpanan sedang, tetapi penyimpanan lokal tidak boleh menjadi sumber data utama. Penggunaan bandwidth tetap harus dibatasi. | Ada manusia yang dapat membaca alasan kegagalan, memperbaiki data, dan menentukan tindakan berikutnya. |
| **Jastiper Mobile Client** | Tidak dapat menjamin rahasia berada di luar jangkauan pemilik perangkat sehingga tidak boleh menyimpan shared client secret. Token dapat dilindungi dengan secure storage, tetapi klien tetap diperlakukan sebagai public client. | Intermiten dan dapat sering tidak tersedia ketika jastiper membeli atau mengantarkan barang. | Operasi yang memperebutkan resource harus mendapat jawaban maksimal 5 detik ketika daring; pembaruan nonkritis dapat diantrikan maksimal 30 menit sampai jaringan tersedia. | Baterai, memori, penyimpanan, dan bandwidth terbatas. Hanya pesanan terbaru dan mutasi tertunda yang disimpan secara lokal. | Jastiper menafsirkan respons, tetapi sinkronisasi pembaruan nonkritis dapat berlangsung otomatis di latar belakang. |
| **Handover Verification Device** | Dapat menyimpan credential unik per perangkat di keystore atau secure element. Credential harus berkewenangan terbatas dan dapat dicabut untuk setiap perangkat. | Intermiten; perangkat dapat kehilangan koneksi ketika kode serah-terima dipindai. | Hasil pemindaian harus terlihat maksimal 2 detik; catatan tertunda harus tersinkronisasi maksimal 5 menit setelah jaringan kembali. | Memori, daya, penyimpanan, dan bandwidth sangat terbatas sehingga payload harus kecil dan hanya memuat data serah-terima yang diperlukan. | Manusia hadir saat pemindaian, tetapi perangkat tidak boleh mengharuskan pengguna menafsirkan error teknis yang kompleks; hasil harus sederhana dan deterministik. |
| **MCP Operations Client** | Dapat menyimpan credential di lingkungan server yang dikendalikan pengelola dan tidak dapat diakses pengguna akhir. Credential dibatasi pada operasi administratif yang diperlukan. | Diharapkan selalu tersedia, tetapi tetap harus menangani timeout dan gangguan service. | Permintaan tunggal ditargetkan maksimal 10 detik; pemeriksaan beberapa pesanan dapat berlangsung maksimal 60 detik. | Komputasi cukup tersedia, tetapi dibatasi biaya token, kuota API, dan ukuran context sehingga memerlukan pagination dan respons ringkas. | Tidak ada manusia yang menafsirkan setiap respons. Agen memproses respons secara mandiri, tetapi tindakan konsekuensial tetap memerlukan persetujuan admin. |
| **Klien Kelompok Mitra** | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. |

### Kesimpulan per Klien

1. **Web Client:** Karena browser tidak dapat menyimpan client secret secara aman dan koneksinya dapat terputus saat mengirim operasi unsafe, Web Client harus menggunakan public-client flow, token berumur pendek, dan `Idempotency-Key` yang sama pada setiap retry untuk maksud yang sama.

2. **Jastiper Mobile Client:** Karena jaringan jastiper sering tidak tersedia dan sumber daya perangkat terbatas, Jastiper Mobile Client memerlukan durable mutation queue, payload ringkas, serta penggunaan kembali `Idempotency-Key` sampai mutasi yang sama berhasil.

3. **Handover Verification Device:** Karena koneksi dan sumber daya perangkat serah-terima terbatas, perangkat memerlukan credential unik berkewenangan sempit, respons yang ringkas dan deterministik, serta antrean catatan yang tetap bertahan ketika jaringan terputus.

4. **MCP Operations Client:** Karena agen memproses respons tanpa interpretasi manusia pada setiap langkah serta dibatasi biaya token dan context, MCP Operations Client memerlukan pagination, Problem Details yang dapat diproses mesin, respons ringkas, dan persetujuan admin sebelum tindakan konsekuensial.

5. **Klien Kelompok Mitra:** Karena karakteristik klien mitra belum diketahui, kontrak tidak boleh bergantung pada asumsi platform, kemampuan menyimpan rahasia, ketersediaan jaringan, atau perilaku error yang tidak didokumentasikan.

## A.4 Dekomposisi Aturan Bisnis

### Aturan Bisnis yang Dipilih

> Satu pesanan jasa titip hanya boleh memiliki satu penawaran terpilih dan satu jastiper aktif.

Aturan ini dipilih karena pelanggarannya dapat menyebabkan lebih dari satu jastiper membeli barang untuk pesanan yang sama, menimbulkan pembayaran atau pengeluaran ganda, serta memicu perselisihan antara pemesan dan jastiper. Aturan harus ditegakkan secara atomik agar dua request yang diproses hampir bersamaan tidak dapat menghasilkan dua penawaran terpilih.

| Lapisan | Peran terhadap aturan |
| --- | --- |
| **Service - menegakkan** | Service menjadi satu-satunya lapisan yang menegakkan aturan secara otoritatif. Ketika pemesan memilih penawaran, service memeriksa secara atomik bahwa pesanan berstatus `open`, belum memiliki penawaran terpilih, dan penawaran tersebut masih aktif serta berasal dari pesanan yang sama. Jika valid, service membuat `Assignment`, mencatat `selectedOfferId` dan `assignedJastiperId`, lalu mengubah status pesanan menjadi `assigned`. Jika pesanan telah memiliki penawaran terpilih, service menolak request dengan `409 Conflict`. |
| **Kontrak - menyatakan** | Kontrak menyatakan bahwa `POST /v1/orders/{orderId}/assignment` hanya diperbolehkan ketika pesanan berstatus `open`. Request memuat `offerId` dan wajib menggunakan header `Idempotency-Key`. Respons berhasil adalah `201 Created` dengan data assignment dan pesanan berstatus `assigned`. Penolakan karena penawaran telah dipilih menggunakan `409 Conflict` dengan Problem Details bertipe `https://api.titipin.example/problems/offer-already-selected`. Schema pesanan menyediakan `status`, `selectedOfferId`, dan `assignedJastiperId` agar klien dapat memprediksi hasil. Retry dengan key dan body yang sama mengembalikan respons tersimpan, sedangkan penggunaan key yang sama dengan body berbeda ditolak menggunakan problem type `https://api.titipin.example/problems/idempotency-key-reuse`. |
| **Klien - memprediksi** | Klien hanya menampilkan kontrol pemilihan penawaran ketika pesanan berstatus `open`. Setelah satu penawaran dipilih, kontrol untuk penawaran lain disembunyikan atau dinonaktifkan. Jika data klien sudah kedaluwarsa dan service mengembalikan `409 Conflict`, klien menampilkan alasan penolakan dan memuat ulang data pesanan. Perilaku ini meningkatkan pengalaman pengguna, tetapi tidak menjadi mekanisme penegakan aturan. |

Dengan pembagian tersebut, aturan hanya ditegakkan satu kali di service. Kontrak mendokumentasikan perilaku yang dapat diprediksi, sedangkan klien membantu mencegah tindakan yang sudah diketahui tidak valid tanpa mengambil alih kewenangan service.
