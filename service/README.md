| Operation | Served by | Remaining work |
| --- | --- | --- |
| `GET /v1/requests/{requestId}` | service | Contract test; verifikasi deployment. |
| `GET /v1/offers/{offerId}` | mock | semuanya |
| `GET /v1/assignments/{assignmentId}` | service | Contract test; verifikasi deployment. |
| `GET /v1/payments/{paymentId}` | mock | semuanya |
| `GET /v1/deliveries/{deliveryId}` | mock | semuanya |
| `GET /v1/receipt-confirmations/{confirmationId}` | mock | semuanya |
| `GET /v1/accounts/{accountId}` | mock | semuanya |
| `GET /v1/issues/{issueId}` | mock | semuanya |
| `GET /v1/requests` | service | Contract test; verifikasi deployment. |
| `GET /v1/requests/{requestId}/offers` | mock | semuanya |
| `GET /v1/deliveries/{deliveryId}/locations` | mock | semuanya |
| `GET /v1/issues` | mock | semuanya |
| `POST /v1/requests` | mock | semuanya (termasuk validasi Idempotency-Key) |
| `POST /v1/requests/{requestId}/offers` | mock | semuanya |
| `POST /v1/requests/{requestId}/assignments` | service | Verifikasi transaksi, replay, dan restart; contract test; deployment. |
| `POST /v1/assignments/{assignmentId}/payments` | mock | semuanya |
| `POST /v1/assignments/{assignmentId}/deliveries` | mock | semuanya |
| `POST /v1/deliveries/{deliveryId}/locations` | mock | semuanya |
| `POST /v1/deliveries/{deliveryId}/receipt-confirmations`| mock | semuanya |
| `POST /v1/issues` | mock | semuanya |
| `POST /v1/issues/{issueId}/resolutions` | mock | semuanya |