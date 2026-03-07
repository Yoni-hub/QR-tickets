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

## 2026-03-05 (PDF download reliability)
- Fixed user-facing PDF download failure by restarting backend on latest route set (serving `GET /api/events/:eventId/tickets.pdf`).
- Added frontend error handling for PDF download in Home and Dashboard so failures are shown instead of silently failing.

## 2026-03-05 (Homepage ticket-type form UX)
- Added explicit labels on homepage form fields (event name/location/date, ticket type, ticket price, ticket count).
- Replaced single ticket config with dynamic ticket-type blocks for `General`, `VIP`, `VVIP`.
- Added `Add more ticket types` behavior that only exposes unselected remaining ticket types when adding new blocks.

## 2026-03-05 (Session Handoff Checkpoint)
- Committed and pushed camera/verify/PDF changes to `main` (`53cf1b3`).
- Added and documented automated memory checkpoint tooling (`ops/checkpoint.ps1`).
- Updated orchestrator workflow to require checkpoint execution during handoff conditions.
- Verified this checkpoint does not introduce new API routes or schema changes beyond already-documented camera/verify/PDF updates.

## 2026-03-06 (Dashboard Email Preview Editor)
- Added customizable email subject/body templates for `POST /api/orders/:accessCode/send-links`.
- Added Dashboard email content preview editor with live template rendering before send.
- Added placeholder support for `{{eventName}}`, `{{eventDate}}`, `{{eventAddress}}`, `{{ticketType}}`, `{{ticketUrl}}`, `{{recipientEmail}}`.
- Kept send flow backward-compatible by using server defaults when custom template fields are not provided.

## 2026-03-06 (PDF Tickets Per Page)
- Added `tickets per page` selection in Dashboard PDF delivery flow (`1`, `2`, `3`, `4`).
- Extended `GET /api/events/:eventId/tickets.pdf` with optional query `perPage`.
- Updated HTML PDF renderer and fallback `pdf-lib` renderer to honor selected tickets-per-page count.
