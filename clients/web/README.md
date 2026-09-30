# Titipin Web Client

Klien browser untuk service Titipin. Klien ini memakai URL API dari environment, Authorization Code + PKCE untuk login, dan satu API layer di `src/api.js`.

## Menjalankan lokal

1. Jalankan service pada port `8080` dan Keycloak pada port `8081` sesuai instruksi `infra/`.
2. Salin `.env.example` menjadi `.env`, lalu sesuaikan URL API dan issuer bila perlu.
3. Dari folder ini jalankan:

   ```bash
   npm run dev
   ```

3. Buka <http://localhost:5173>. Redirect URI Keycloak harus sama persis dengan `http://localhost:5173/callback`.

## Build dan preview

```bash
npm run build
npm run preview
```

Build membaca `VITE_API_BASE_URL`, `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID`, dan `VITE_OIDC_REDIRECT_URI`. Hasilnya berada di `dist/` dan dapat di-host sebagai static site. `vercel.json` sudah menyiapkan SPA rewrite agar URL detail tetap dapat dibuka langsung.

## Perilaku yang diuji

- `src/api.js` adalah satu-satunya modul aplikasi yang memanggil `fetch`.
- Token dipasang di sana; 401 mencoba refresh lalu mengarahkan ke login, 403 menampilkan penolakan domain, dan 404 menampilkan data tidak ditemukan.
- Koleksi polling mengirim `If-None-Match` dan menerima 304 sebagai keberhasilan.
- Mutasi mengirim `Idempotency-Key` dan, jika tersedia, `If-Match`; 412 ditampilkan sebagai konflik perubahan yang perlu dimuat ulang.
- Setiap halaman data memiliki loading, empty, error, dan content state.
