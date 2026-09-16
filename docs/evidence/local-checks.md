# Bukti pemeriksaan lokal P4

Dicatat pada 2026-09-16 dari source paket perubahan ini.

| Pemeriksaan | Hasil aktual |
| --- | --- |
| JavaScript baru/berubah: node --check | Lulus |
| npm run lint:contract | Lulus, 0 error dan 3 warning dokumentasi |
| node tests/check-security.cjs | Lulus: 21 operasi protected, 8 scope, /health publik, 401/403/404 |
| npm run test:contract | 9 lulus, 0 gagal |
| npm run test:authz | 10 lulus, 0 gagal |
| npm run test:authz:mutations | N1-N4 RED ketika guard dilepas dan GREEN setelah dipulihkan |
| Mock Prism memuat openapi.yaml | Berhasil memuat 22 operasi termasuk /health dan mencetak listening pada port 4010 |
| package.json dengan package-lock.json | Dependency/version root sesuai |
| git diff --check untuk source yang diubah | Tidak ada error whitespace |

Tiga warning Redocly: metadata license belum ada, server lokal memakai localhost,
dan health publik tidak mendeklarasikan 4XX. Tidak ada aturan lint yang dimatikan.

Test memakai PostgreSQL WASM (PGlite) terisolasi dan JWKS/key pair RS256 sementara.
Tidak ada koneksi ke database P3 atau Keycloak pengguna dalam pemeriksaan ini.
Workflow GitHub disiapkan memakai PostgreSQL 17, tetapi run GitHub belum dilakukan.

## Bukti mutation test

```text
N1: RED without guard; GREEN after restoring guard
N2: RED without guard; GREEN after restoring guard
N3: RED without guard; GREEN after restoring guard
N4: RED without guard; GREEN after restoring guard
```

## Yang belum merupakan bukti kelulusan

- Rotasi/reuse keluarga refresh token pada Keycloak pengguna: belum dijalankan.
- Migrasi dan mapping pada database P3 pengguna: belum dijalankan.
- Demonstrasi URL deployment dan pemeriksaan log hosting: belum dijalankan.
- CI GitHub hijau, push commit dan tag l4: belum dilakukan.
- Enam belas operasi bisnis yang masih mock: belum diimplementasikan.

Hasil lokal ini tidak menggantikan bukti eksternal tersebut.
