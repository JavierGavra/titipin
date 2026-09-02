# Kebijakan Versioning dan Kompatibilitas API Titipin

## Prinsip Kompatibilitas

API Titipin menggunakan URI-path versioning. Versi mayor ditempatkan pada base URL, misalnya `https://api.titipin.example/v1`, sehingga path di dalam `openapi.yaml` cukup ditulis sebagai `/requests`, `/offers/{offerId}`, dan seterusnya. Nilai `info.version` merupakan versi dokumen kontrak, bukan versi mayor pada URL.

Suatu perubahan dinyatakan kompatibel apabila klien yang dibuat sebelum perubahan tersebut, dan tidak mengetahui adanya perubahan, tetap dapat berfungsi tanpa modifikasi. Perubahan kompatibel tetap menggunakan `/v1`; perubahan yang memutus klien lama harus diterbitkan melalui versi mayor baru, misalnya `/v2`.

## Klasifikasi Perubahan

| Perubahan | Status dalam `/v1` | Ketentuan dan alasan |
|---|---|---|
| Menambahkan field request opsional | Diizinkan | Server menetapkan perilaku atau nilai default ketika field tidak dikirim klien lama. |
| Menambahkan field respons | Diizinkan | Klien wajib mengabaikan field respons yang tidak dikenal. |
| Menambahkan endpoint atau query parameter opsional | Diizinkan | Perubahan bersifat aditif dan tidak mengubah request lama. |
| Menambahkan nilai enumeration | Diizinkan bersyarat | Hanya diizinkan karena kontrak telah menetapkan penanganan nilai enum yang tidak dikenal. |
| Mengubah field request opsional menjadi wajib | Tidak diizinkan | Request klien lama akan ditolak dengan `422`. |
| Menghapus atau mengganti nama field respons | Tidak diizinkan | Field baru harus ditambahkan, sedangkan field lama dipertahankan dan ditandai deprecated. |
| Mengubah tipe, format, atau mempersempit rentang nilai | Tidak diizinkan | Data atau request yang sebelumnya valid dapat menjadi tidak valid. |
| Mengubah arti field, enum, status code, atau Problem `type` | Tidak diizinkan | Klien lama dapat mengambil keputusan yang salah tanpa mendeteksi perubahan protokol. |
| Mengganti method atau URI operasi yang sudah dipublikasikan | Tidak diizinkan | Pemanggilan klien lama tidak lagi mencapai operasi yang sama. Endpoint pengganti harus ditambahkan secara aditif. |

Setiap perubahan kontrak harus dicatat pada `CHANGELOG.md`. Perubahan kompatibel menaikkan `info.version` tanpa mengubah `/v1`. Perubahan breaking memerlukan keputusan arsitektur, masa migrasi, dan versi mayor baru.

## Penanganan Field dan Enumeration yang Tidak Dikenal

Klien wajib mengabaikan field tambahan pada respons yang tidak dikenal dan tetap memproses field yang dipahaminya. Klien tidak boleh gagal melakukan deserialisasi hanya karena service menambahkan field respons.

Nilai status Request, Offer, Assignment, Payment, Delivery, atau TransactionIssue yang tidak dikenal harus diperlakukan sebagai kondisi belum terminal. Klien wajib menampilkan state secara aman, menonaktifkan tindakan konsekuensial, dan mengambil representasi terbaru sebelum menawarkan tindakan kepada pengguna. Klien tidak boleh memetakan nilai baru secara diam-diam menjadi `completed`, `cancelled`, `refunded`, atau status terminal lainnya.

## Mekanisme Deprecation dan Sunset

Elemen lama tidak langsung dihapus. Penggantinya ditambahkan terlebih dahulu, lalu endpoint, parameter, atau field lama diberi `deprecated: true` dan penjelasan pengganti pada `openapi.yaml`. Selama masa deprecation, perilaku dan makna elemen lama harus tetap sama.

Respons dari endpoint deprecated menyertakan tanggal mulai deprecation, tanggal rencana penghentian, dan tautan panduan migrasi:

```http
Deprecation: @1798761600
Sunset: Thu, 01 Jul 2027 00:00:00 GMT
Link: <https://api.titipin.example/docs/deprecations/example>; rel="deprecation"; type="text/html"
```

`Deprecation` menggunakan Structured Field Date berupa Unix timestamp yang diawali `@`, sedangkan `Sunset` menggunakan HTTP-date. Tanggal `Sunset` tidak boleh lebih awal daripada tanggal `Deprecation`. Header tersebut juga harus didefinisikan pada respons terkait di `openapi.yaml`, disertai tanggal, alasan, pengganti, dan langkah migrasi pada `CHANGELOG.md`.

Deprecation tidak mengubah perilaku endpoint. Endpoint atau field lama dipertahankan selama `/v1` masih didukung dan hanya boleh dihapus pada versi mayor berikutnya setelah periode migrasi yang diumumkan berakhir.

## Pemeriksaan Sebelum Publikasi

Contract Owner menilai setiap perubahan dengan pertanyaan berikut:

1. Apakah klien lama masih dapat mengirim request yang sama dan memahami responsnya?
2. Apakah perubahan hanya menambahkan sesuatu yang dapat diabaikan klien lama?
3. Apakah nilai enum baru dapat ditangani tanpa crash atau tindakan konsekuensial yang salah?
4. Apakah perubahan mengubah arti, tipe, kewajiban field, status code, atau Problem `type`?
5. Jika deprecated, apakah kontrak, header, changelog, pengganti, dan jadwal migrasi sudah tersedia?

Jika jawaban menunjukkan klien lama memerlukan perubahan, perubahan tersebut tidak boleh diterbitkan pada `/v1`.
