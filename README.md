## Pembentukan Kelompok & Pembagian Peran

### Anggota Kelompok

1. **Ridlo Fanata Wicaksana** (NIM: 26/591572/NPA/20034)
2. **Javier Gavra Abhinaya** (NIM: 26/592020/NPA/20050)
3. **Nur Alif Maulana Syafrudin** (NIM: 26/591608/NPA/20042)

_(Catatan: Mengingat jumlah anggota sebanyak tiga orang, peran Contract Owner dan Integration Owner digabung menjadi satu tanggung jawab)._

### Deskripsi Peran

- **Client Owner**: Bertanggung jawab atas klien yang dihadapi pengguna, serta melakukan pelaporan tertulis atas setiap ambiguitas yang ditemukan dalam kontrak.
- **Service Owner**: Bertanggung jawab atas _backend_ yang di-_deploy_, melakukan konfigurasi, menjalankan migrasi, dan memastikan _health endpoint_-nya berjalan (mulai Pertemuan 3).
- **Contract & Integration Owner**: Memegang tanggung jawab utama atas `openapi.yaml` di mana setiap perubahan antarmuka wajib ditinjau oleh peran ini. Peran ini juga bertanggung jawab atas _mock server_, _contract test_, dan koordinasi dengan kelompok mitra pada Pertemuan 7.

### Jadwal Rotasi Peran

| Periode       | Pertemuan                | Client Owner               | Service Owner              | Contract & Integration Owner |
| :------------ | :----------------------- | :------------------------- | :------------------------- | :--------------------------- |
| **Periode 1** | Pertemuan 2, 3, 4        | Ridlo Fanata Wicaksana     | Nur Alif Maulana Syafrudin | Javier Gavra Abhinaya        |
| **Periode 2** | Pertemuan 5, 6, 7        | Javier Gavra Abhinaya      | Ridlo Fanata Wicaksana     | Nur Alif Maulana Syafrudin   |
| **Periode 3** | Pertemuan 8, 9, 10       | Nur Alif Maulana Syafrudin | Javier Gavra Abhinaya      | Ridlo Fanata Wicaksana       |
| **Periode 4** | Pertemuan 11, 12, 13, 14 | Ridlo Fanata Wicaksana     | Nur Alif Maulana Syafrudin | Javier Gavra Abhinaya        |

## Menjalankan pemeriksaan dan mock

Jalankan dari root repository.

```bash
npx --yes @redocly/cli lint openapi.yaml
npx --yes @stoplight/prism-cli mock openapi.yaml -p 4010
```

Mock server tersedia di `http://127.0.0.1:4010`. Jalankan contoh berikut dari terminal lain.

### Contoh `curl`

```bash
# 1. Membaca request dengan filter
curl -i "http://127.0.0.1:4010/requests?status=open&limit=20"

# 2. Membuat purchase request
curl -i -X POST "http://127.0.0.1:4010/requests" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 0f7c1b9e-3d21-4a6f-9c05-8e2b7d41a9f0" \
  --data '{"requesterId":"22222222-2222-4222-8222-222222222222","itemName":"Kopi lokal","itemDescription":"Kopi arabika 250 gram","storeArea":"Bandung","budget":{"amount":150000,"currency":"IDR"},"deliveryAddress":"Jalan Merdeka 10, Bandung","deadline":"2026-09-10T12:00:00Z"}'

# 3. Memilih offer untuk membuat assignment
curl -i -X POST "http://127.0.0.1:4010/requests/11111111-1111-4111-8111-111111111111/assignments" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 1f7c1b9e-3d21-4a6f-9c05-8e2b7d41a9f1" \
  --data '{"offerId":"33333333-3333-4333-8333-333333333333"}'
```

## Deployment P3

- Service: Vercel.
- Database: PostgreSQL pada Neon.
- URL service: https://titipin-nine.vercel.app
- Base URL API: https://titipin-nine.vercel.app/v1
- Health endpoint: https://titipin-nine.vercel.app/health

Service dapat mengalami cold start pada paket hosting gratis.

Panduan implementasi dan status operasi tersedia di service/README.md.
Keputusan implementasi tersedia di docs/decisions/0002-implementasi.md.

## Aplikasi web browser

Folder `clients/web` berisi klien browser yang dibangun di atas operasi pada `openapi.yaml`. Tidak ada endpoint baru yang ditambahkan untuk mempermudah antarmuka. Salin `clients/web/.env.example` menjadi `clients/web/.env`, isi URL API dan issuer, lalu jalankan `npm run dev` dari folder tersebut setelah service dan Keycloak lokal tersedia.

### Ruang lingkup workflow

| Workflow | Screen/URL | Role | Operasi kontrak | Panggilan sebelum tampil |
| --- | --- | --- | --- | ---: |
| Requester membuat permintaan | Dashboard `/dashboard`, form `/requests/new` | `requester` | `GET /v1/requests`, `POST /v1/requests` | 1 |
| Requester memilih penawaran | Detail `/requests/{requestId}` | `requester` | `GET /v1/requests/{requestId}`, `GET /v1/requests/{requestId}/offers`, `POST /v1/requests/{requestId}/assignments` | 2 |
| Requester membayar | Detail `/assignments/{assignmentId}` | `requester` | `GET /v1/assignments/{assignmentId}`, `POST /v1/assignments/{assignmentId}/payments` | 1 |
| Jastiper memenuhi permintaan | Dashboard dan detail request | `jastiper` | `GET /v1/requests?status=open`, `GET /v1/requests/{requestId}`, `GET /v1/requests/{requestId}/offers`, `POST /v1/requests/{requestId}/offers`, `POST /v1/assignments/{assignmentId}/deliveries` | 1–2 |
| Admin menindaklanjuti kendala | `/issues`, `/issues/{issueId}` | `admin` | `GET /v1/issues`, `GET /v1/issues/{issueId}`, `POST /v1/issues/{issueId}/resolutions` | 1 |

Operasi pada kolom terakhir semuanya terdaftar di `openapi.yaml`. Jika service menolak sebuah operasi, aplikasi menampilkan refusal dari service dan tidak menggantinya dengan endpoint tambahan.

### Keputusan sesi browser

Access token dan refresh token disimpan di `localStorage` agar sesi dan URL detail tetap dapat digunakan setelah reload atau dibuka di tab baru. Penyimpanan ini dibaca oleh JavaScript yang berjalan pada origin yang sama, sehingga risiko XSS lebih besar daripada cookie `HttpOnly`; produksi harus menambahkan Content Security Policy, sanitasi output, dan meminimalkan masa berlaku token. PKCE verifier dan state hanya disimpan sementara di `sessionStorage` sampai callback login selesai.

Kontrak saat ini tidak menyediakan operasi sign-out server. Tombol keluar menghapus access token dan refresh token lokal; pencabutan token tetap mengikuti masa berlaku dan kebijakan rotasi authorization server.

### Empat state dan kegagalan jaringan

Setiap tampilan data memiliki skeleton saat loading, kalimat khusus saat empty, pesan domain dan tombol retry saat error, serta content dengan waktu pengambilan dan penanda stale saat refresh latar belakang gagal. API layer menerjemahkan Problem Details: 401 menghapus sesi dan kembali ke login, 403 menjelaskan bahwa role tidak memiliki izin, 404 menjadi tampilan tidak ditemukan, 400 menempatkan `invalidParameters` pada field, dan 412 menjelaskan konflik ETag.

### Deployment

Build web dilakukan dari `clients/web` dengan `npm run build`. Set environment deployment berikut: `VITE_API_BASE_URL`, `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI`, dan `WEB_ORIGINS` pada service. URL aplikasi web untuk presentasi: `https://titipin-fe.vercel.app`. URL service yang sudah tersedia: `https://titipin-nine.vercel.app/v1`.

### Akun Uji Coba

Untuk pengujian dan evaluasi pada aplikasi web publik, penguji dapat menggunakan akun berikut:

| Role | Username | Password | Deskripsi Alur Uji |
| :--- | :--- | :--- | :--- |
| `requester` | `requester-a` | `Password123!` | Membuat permintaan belanja (`/requests/new`), memilih penawaran, dan membayar simulasi |
| `jastiper` | `jastiper-a` | `Password123!` | Melihat permintaan belanja terbuka dan mengajukan penawaran (*offer*) |
| `admin` | `admin-a` | `Password123!` | Memantau dan menyelesaikan laporan kendala transaksi (`/issues`) |

Urutan demo dan contoh serangan console tersedia di [docs/demo-web.md](docs/demo-web.md).
