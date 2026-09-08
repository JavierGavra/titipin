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
curl -i "http://127.0.0.1:4010/requests?status=open&limit=20" \
  -H "Authorization: Bearer demo-token"

# 2. Membuat purchase request
curl -i -X POST "http://127.0.0.1:4010/requests" \
  -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 0f7c1b9e-3d21-4a6f-9c05-8e2b7d41a9f0" \
  --data '{"requesterId":"22222222-2222-4222-8222-222222222222","itemName":"Kopi lokal","itemDescription":"Kopi arabika 250 gram","storeArea":"Bandung","budget":{"amount":150000,"currency":"IDR"},"deliveryAddress":"Jalan Merdeka 10, Bandung","deadline":"2026-09-10T12:00:00Z"}'

# 3. Memilih offer untuk membuat assignment
curl -i -X POST "http://127.0.0.1:4010/requests/11111111-1111-4111-8111-111111111111/assignments" \
  -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 1f7c1b9e-3d21-4a6f-9c05-8e2b7d41a9f1" \
  --data '{"offerId":"33333333-3333-4333-8333-333333333333"}'
```
