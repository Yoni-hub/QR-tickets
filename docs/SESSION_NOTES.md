# Session Notes

## 2026-03-05
- Created standalone QR Tickets architecture and local scaffold.
- Implemented MVP API and frontend flow.
- Added deployment foundations and memory tooling.

## 2026-03-05 (Camera + Verify + PDF)
- Added camera QR scanning on scanner page using `html5-qrcode` with cooldown and URL/raw parsing fallback.
- Added ticket verification API and frontend route (`GET /api/tickets/:ticketPublicId`, `/t/:ticketPublicId`).
- Added event tickets PDF download endpoint and dashboard/home download buttons.
- Standardized QR payload generation to `${PUBLIC_BASE_URL}/t/${ticketPublicId}`.
- Updated API/data model/decisions docs accordingly.
