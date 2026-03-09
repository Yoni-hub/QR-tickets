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

## 2026-03-08 (Admin Panel Phase 1)
- Added protected internal admin panel routes under `/admin/*` with `x-admin-key` backend protection.
- Added admin read endpoints for overview/events/event detail/tickets/deliveries/scans/settings/audit.
- Added admin action endpoints for event disable/enable/archive/access-code-rotate, ticket invalidate/restore/reset-usage, delivery retry, and scan suspicious marking.
- Added lightweight admin audit logging model and API.
- Added extended scan metadata capture (`rawScannedValue`, normalized ID, source) and ticket view logging.

## 2026-03-08 (Club Ticketing + Manual Payment + Promoters)
- Added public event request flow: `/e/:eventSlug` and `/e/:eventSlug/confirm`.
- Added public APIs for event lookup by slug and ticket request creation (`PENDING_PAYMENT`).
- Added organizer approval flow for ticket requests (approve/reject) with ticket generation and optional delivery.
- Added promoter model and promoter management APIs (create/list/update/delete) with referral links (`?ref=code`).
- Added promoter metrics/leaderboard (requests, approved tickets, scanned entries).
- Added scanner response enrichment with attendee/promoter details for `VALID` and `USED`.
- Added organizer manual guest add and CSV bulk import flows tied to the event access code.

## 2026-03-08 (Dashboard / Homepage Workflow Update)
- Reorganized Dashboard into menu-based sections: Events, Tickets, Delivery Method, Ticket Requests, Promoters.
- Added inline event editing in Events section with save endpoint.
- Added native public ticket page sample preview card in Events section (non-iframe).
- Added compact tickets list mobile layout and pagination (`5` tickets per page).
- Home page now focuses on access-code start flow (`Get Started`) without ticket generation.
- Restored full ticket editor in Dashboard Tickets section, configured to generate tickets for the currently loaded access code/event only.

## 2026-03-09 (Prisma Migration Reconciliation)
- Fixed migration-chain inconsistency where later `TicketRequest` migrations existed without an earlier base migration creating `TicketRequest`/related relations in shadow DB flows.
- Added reconciliation migration `20260308160000_ticket_request_base_and_relations` with idempotent SQL (`IF NOT EXISTS` / guarded constraints) to establish missing base objects safely.
- Used `npx prisma migrate resolve --applied` for already-reflected historical migrations so migration history matched the actual schema without destructive reset.
- Then applied `20260309110000_ticket_request_client_access_token` via `npx prisma migrate dev`; `npx prisma migrate status` now reports schema up to date.

## 2026-03-09 (Checkpoint)
- [2026-03-09 16:15:57 -04:00] Implemented organizer-client request chat, admin client token tooling, admin pagination updates, and public/client request flow refinements.
