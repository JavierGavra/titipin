# Analisis Domain Sistem Titipin

## A.2 Penetapan Domain

Titipin adalah marketplace permintaan jasa titip lokal. Pemesan memasang permintaan pembelian berisi deskripsi barang, anggaran, alamat pengantaran, tenggat, serta lokasi pembelian pilihan bila diketahui. Jastiper terverifikasi mengajukan estimasi biaya, lalu pemesan memilih satu jastiper dan melakukan pembayaran simulasi. Jastiper terpilih mencari barang dengan check-in lokasi, membeli, dan mengantarkannya sambil membagikan progres. Transaksi selesai setelah penerimaan dikonfirmasi, atau berakhir `unfulfilled` jika barang tidak ditemukan. Biaya pencarian hanya diberikan jika buktinya valid, sedangkan admin memantau transaksi bermasalah dan komisi platform.

### Pemeriksaan Pemenuhan Syarat Domain

1. **Minimal tiga jenis aktor dengan hak akses berbeda - Terpenuhi.** Pemesan membuat permintaan titip, memilih penawaran, melakukan pembayaran simulasi, memantau progres, dan mengonfirmasi penerimaan. Jastiper mengajukan penawaran, melakukan pencarian setelah terpilih, membuat check-in, mengunggah bukti, membeli barang, dan memperbarui status pengantaran. Admin memverifikasi jastiper, meninjau bukti pencarian yang bermasalah, memantau transaksi, serta menangani kasus yang memerlukan pemeriksaan tanpa mengambil alih kewenangan pemesan atau jastiper.

2. **Minimal satu operasi unsafe dan konsekuensial - Terpenuhi.** Pemilihan penawaran dan pencatatan pembayaran mengubah keadaan bisnis dan tidak boleh menghasilkan efek ganda. Dua request pemilihan yang diproses bersamaan dapat menugaskan dua jastiper untuk satu permintaan, sedangkan retry pembayaran tanpa perlindungan dapat membuat dua catatan pembayaran atau dua perhitungan komisi. Service harus memilih penawaran secara atomik dan setiap retry pembayaran dengan maksud yang sama harus memakai `Idempotency-Key` yang sama.

3. **Minimal satu aktor bekerja dengan konektivitas tidak andal - Terpenuhi.** Jastiper bekerja secara berpindah-pindah ketika mencari, membeli, dan mengantarkan barang sehingga dapat mengalami jaringan intermiten saat membuat check-in, mengunggah bukti, atau mengirim lokasi pengantaran. Jastiper Mobile Client harus menyimpan mutasi tertunda beserta waktu kejadian dan idempotency key, menandainya sebagai `pending_sync`, lalu mengirimkannya kembali ketika koneksi tersedia tanpa menggandakan perubahan.

4. **Cakupan cukup kecil untuk diselesaikan - Terpenuhi.** Sistem dibatasi pada satu alur permintaan titip lokal: pembuatan permintaan, pengajuan dan pemilihan satu penawaran, pembayaran simulasi, pencarian oleh jastiper terpilih, pembelian, pengantaran, serta akhir `completed` atau `unfulfilled`. Peta hanya menampilkan check-in pencarian dan lokasi terakhir pengantaran; sistem tidak mencakup katalog penjual, inventori, payment gateway nyata, navigasi, optimasi rute, maupun penyimpanan riwayat rute lengkap.

## A.3 Taksonomi Lima Sumbu

Klien yang direncanakan terdiri atas Web Client untuk pemesan dan admin, Jastiper Mobile Client untuk jastiper di lapangan, Handover Verification Device untuk pencatatan serah-terima, MCP Operations Client untuk membantu peninjauan administratif, serta Klien Kelompok Mitra yang karakteristiknya belum diketahui. Device dan MCP bukan aktor bisnis baru; keduanya hanya menjadi kanal dengan kewenangan terbatas bagi aktor yang sudah ada.

| Klien | Kemampuan menyimpan rahasia | Ketersediaan jaringan | Anggaran latensi | Batas sumber daya | Kehadiran manusia |
| --- | --- | --- | --- | --- | --- |
| **Web Client** | Browser tidak dapat menyimpan `client secret` secara aman karena kode dan penyimpanannya berada dalam kendali pengguna. Klien diperlakukan sebagai public client dengan token berumur pendek. | Umumnya tersedia, tetapi koneksi dapat terputus ketika permintaan, pemilihan penawaran, atau pembayaran dikirim. | Tampilan permintaan dan lokasi terakhir ditargetkan maksimal 2 detik; operasi konsekuensial harus memperoleh kepastian maksimal 5 detik. | Memori dan penyimpanan sedang, tetapi penyimpanan lokal tidak menjadi sumber data utama. Pembaruan peta harus dibatasi agar tidak menghabiskan bandwidth. | Pemesan atau admin hadir untuk membaca alasan kegagalan, memperbaiki data, dan menentukan tindakan berikutnya. |
| **Jastiper Mobile Client** | Perangkat pengguna tidak dapat menjamin kerahasiaan shared secret. Token dapat dilindungi dengan secure storage, tetapi klien tetap diperlakukan sebagai public client. | Intermiten ketika jastiper mencari, membeli, atau mengantarkan barang. Check-in, bukti, perubahan status, dan lokasi dapat tertunda. | Operasi yang memperebutkan resource ditargetkan maksimal 5 detik saat daring. Mutasi lapangan boleh diantrikan dan harus mulai disinkronkan segera setelah jaringan kembali. | Baterai, GPS, memori, penyimpanan, dan bandwidth terbatas. Pengambilan lokasi pencarian harus hemat daya dan antrean lokal hanya menyimpan data yang belum tersinkronisasi. | Jastiper hadir untuk menyatakan hasil pencarian dan memilih bukti, sedangkan sinkronisasi mutasi nonkritis dapat berjalan otomatis di latar belakang. |
| **Handover Verification Device** | Credential unik per perangkat dapat disimpan di keystore atau secure element. Kewenangannya hanya untuk memverifikasi serah-terima dan dapat dicabut per perangkat. | Intermiten; perangkat dapat kehilangan koneksi ketika kode serah-terima dipindai. | Hasil pemindaian harus terlihat maksimal 2 detik; catatan tertunda harus mulai tersinkronisasi segera setelah jaringan kembali. | Memori, daya, penyimpanan, dan bandwidth sangat terbatas sehingga payload hanya memuat identitas penugasan, kode, dan waktu pemindaian. | Manusia hadir saat pemindaian, tetapi hasil harus sederhana dan deterministik tanpa menuntut interpretasi error teknis yang kompleks. |
| **MCP Operations Client** | Credential dapat disimpan di lingkungan server yang dikendalikan pengelola. Kewenangannya dibatasi untuk membaca kasus dan membuat rekomendasi peninjauan. | Diharapkan selalu tersedia, tetapi tetap harus menangani timeout dan gangguan service. | Permintaan tunggal ditargetkan maksimal 10 detik; pemeriksaan beberapa kasus dapat berlangsung maksimal 60 detik. | Komputasi tersedia, tetapi biaya token, kuota API, dan ukuran context memerlukan pagination, filter, serta respons ringkas. | Agen dapat memproses respons tanpa manusia pada setiap langkah, tetapi keputusan konsekuensial seperti menyetujui bukti atau membatalkan transaksi tetap memerlukan admin. |
| **Klien Kelompok Mitra** | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. | Tidak diketahui. |

### Kesimpulan per Klien

1. **Web Client:** Karena browser tidak dapat menyimpan rahasia dan koneksi dapat terputus saat operasi konsekuensial, Web Client harus memakai public-client flow, token berumur pendek, idempotent retry, serta tampilan lokasi terakhir yang tetap jelas ketika data sudah kedaluwarsa.

2. **Jastiper Mobile Client:** Karena koneksi, baterai, GPS, dan bandwidth terbatas, Jastiper Mobile Client memerlukan durable mutation queue, check-in hemat daya, status `pending_sync`, dan penggunaan kembali `Idempotency-Key` untuk retry dari maksud yang sama.

3. **Handover Verification Device:** Karena koneksi dan sumber dayanya terbatas, perangkat memerlukan credential unik berkewenangan sempit, payload kecil, respons deterministik, serta antrean catatan serah-terima yang bertahan ketika jaringan terputus.

4. **MCP Operations Client:** Karena agen dibatasi biaya token dan dapat memproses respons tanpa manusia, MCP Operations Client memerlukan pagination, Problem Details yang dapat diproses mesin, respons ringkas, dan persetujuan admin sebelum tindakan konsekuensial.

5. **Klien Kelompok Mitra:** Karena karakteristik klien mitra belum diketahui, kontrak tidak boleh bergantung pada asumsi platform, kemampuan menyimpan rahasia, ketersediaan jaringan, dukungan peta, atau perilaku error yang tidak didokumentasikan.

### Implikasi Lokasi terhadap Kontrak

Kontrak API tidak bergantung pada Google Maps atau penyedia peta tertentu. Lokasi dinyatakan sebagai koordinat, tingkat akurasi, waktu kejadian, dan status sinkronisasi sehingga Web Client dapat memilih penyedia peta sebagai lapisan tampilan.

Pada tahap pencarian, jastiper hanya membagikan lokasi perkiraan dan membuat `SearchCheckIn` ketika memeriksa toko. Check-in memuat waktu, koordinat, akurasi, hasil pencarian seperti `item_unavailable`, serta catatan atau bukti foto. GPS tidak dianggap sebagai bukti tunggal; kelayakan biaya pencarian ditentukan dari penugasan aktif, check-in, waktu, dan bukti yang dapat ditinjau admin.

Pada tahap pengantaran, Jastiper Mobile Client dapat mengirim lokasi presisi secara berkala. Web Client menampilkan lokasi terakhir beserta status `live`, `stale`, atau `unavailable`. Pengiriman lokasi dihentikan ketika permintaan berstatus terminal, yaitu `completed`, `unfulfilled`, atau `cancelled`, dan riwayat rute lengkap tidak disimpan sebagai bagian dari cakupan awal.

## A.4 Dekomposisi Aturan Bisnis

### Aturan Bisnis yang Dipilih

> Satu permintaan titip hanya boleh memiliki satu penawaran terpilih dan satu penugasan jastiper aktif.

Aturan ini dipilih karena pelanggarannya dapat membuat lebih dari satu jastiper melakukan pencarian atau membeli barang untuk permintaan yang sama. Akibatnya, pemesan dapat dikenai biaya ganda dan jastiper yang tidak semestinya dapat mengajukan biaya pencarian. Aturan harus ditegakkan secara atomik agar dua request pemilihan yang diproses hampir bersamaan tidak menghasilkan dua penugasan aktif.

| Lapisan | Peran terhadap aturan |
| --- | --- |
| **Service - menegakkan** | Service menjadi satu-satunya lapisan yang menegakkan aturan secara otoritatif. Ketika pemesan memilih penawaran, service memeriksa secara atomik bahwa permintaan berstatus `open`, belum memiliki penawaran terpilih atau penugasan aktif, dan penawaran masih aktif serta berasal dari permintaan yang sama. Jika valid, service membuat `Assignment`, mencatat `selectedOfferId` dan `assignedJastiperId`, lalu mengubah status permintaan menjadi `assigned`. Hanya jastiper pada penugasan aktif yang dapat memulai `SearchSession` dan mengajukan bukti biaya pencarian. Jika penugasan sudah ada, service menolak request dengan `409 Conflict`. |
| **Kontrak - menyatakan** | Kontrak menyatakan bahwa `POST /v1/requests/{requestId}/assignment` hanya diperbolehkan ketika permintaan berstatus `open`. Request memuat `offerId` dan wajib menggunakan header `Idempotency-Key`. Respons berhasil adalah `201 Created` dengan assignment dan permintaan berstatus `assigned`. Penolakan karena penawaran telah dipilih menggunakan `409 Conflict` dengan Problem Details bertipe `https://api.titipin.example/problems/offer-already-selected`. Schema permintaan menyediakan `status`, `selectedOfferId`, dan `assignedJastiperId` agar klien dapat memprediksi hasil. Retry dengan key dan body yang sama mengembalikan respons tersimpan, sedangkan key yang sama dengan body berbeda ditolak menggunakan problem type `https://api.titipin.example/problems/idempotency-key-reuse`. |
| **Klien - memprediksi** | Klien hanya menampilkan kontrol pemilihan ketika permintaan berstatus `open`. Setelah satu penawaran dipilih, kontrol untuk penawaran lain dinonaktifkan. Jika data klien kedaluwarsa dan service mengembalikan `409 Conflict`, klien menampilkan alasan penolakan dan memuat ulang permintaan. Perilaku ini memperbaiki pengalaman pengguna, tetapi tidak menjadi mekanisme penegakan aturan. |

Dengan pembagian tersebut, aturan hanya ditegakkan satu kali di service. Kontrak menyatakan prasyarat, hasil, idempotency, dan bentuk konflik, sedangkan klien membantu pengguna memprediksi tindakan yang valid tanpa mengambil alih kewenangan service.
