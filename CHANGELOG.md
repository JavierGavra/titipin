# Contract changelog

### Added

- Added contract for entire endpoint 

### Removed

- Remove authentication temporarily 
- Remove allowedStatuses 

## [0.1.1] - 2026-09-16

### Fixed
- Mendokumentasikan respons 400 InvalidRequest400 pada GET /v1/requests/{requestId}.
- Alasan: parameter RequestId sudah mensyaratkan panjang 8–64 karakter, tetapi respons untuk pelanggaran batas tersebut belum dicantumkan pada operasi GET detail.
- Klasifikasi: koreksi dokumentasi atas validasi yang sudah berlaku; perilaku request valid tetap sama.