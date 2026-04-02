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

## 2026-03-10 (Checkpoint)
- [2026-03-10 17:55:46 -04:00] Implemented organizer access code upgrades, scanner gate outcomes, and multi-event scanner unlock flow

## 2026-03-11 (Checkpoint)
- [2026-03-11 01:47:35 -04:00] Implemented admin organizer table view, ticket editor stability/quantity flow fixes, delivery/copy UX updates, scanner overlay dismissal flow, and scan ownership hardening for cross-organizer tickets

## 2026-03-12 (Checkpoint)
- [2026-03-12 22:56:52 -04:00] Implemented homepage redesign, how-it-works page, real UI screenshots, interactive feature-card walkthroughs, and hero slideshow refinements.

## 2026-03-13 (Checkpoint)
- [2026-03-13 00:09:49 -04:00] Implemented organizer field persistence, real public-event preview in dashboard, ticket-type deletion guard before generation, and fixed backend Prisma runtime generation issue.

## 2026-03-13 (Checkpoint)
- [2026-03-13 18:22:54 -04:00] Unified the dashboard public-event preview with the live public page, connected organizerName into email preview/sending, and added organizer ticket cancellation flow with buyer messaging.

## 2026-03-14 (Checkpoint)
- [2026-03-14 01:46:02 -04:00] Updated dashboard-first organizer onboarding: removed homepage/how-it-works/demo routes, added events-first pre-load mode, organizer-code generation modal on first event save, and full menu unlock after organizer-code dashboard load.

## 2026-03-14 (Checkpoint)
- [2026-03-14 14:28:12 -04:00] Reconciled memory gaps: API contract status/endpoints and dashboard-first route documentation

## 2026-03-14 (Checkpoint)
- [2026-03-14 16:47:52 -04:00] Dashboard UX updates: onboarding guidance, delivery warning modal, promoter flow simplification, and public event link delivery option

## 2026-03-15 (Checkpoint)
- [2026-03-15 00:15:40 -04:00] Implemented one-time organizer delivery warning gate across all delivery methods, fixed delivery action event-arg bypass, and reconciled architecture/API/data-model memory docs.

## 2026-03-15 (Checkpoint)
- [2026-03-15 18:20:28 -04:00] Added Help FAQ accordion, restored visitor support chat, implemented admin support inbox/badge, and fixed free-event evidence requirement plus support API stability

## 2026-03-17 (Checkpoint)
- [2026-03-17 00:17:58 -04:00] Implemented dashboard hero/home nav flow, scanner stop-camera stability fix, support chat reliability fixes, and ticket-request status rename to PENDING_VERIFICATION.

## 2026-03-17 (Checkpoint)
- [2026-03-17 15:30:39 -04:00] Reconciled memory docs for TicketRequest status rename to PENDING_VERIFICATION

## 2026-03-17 (Checkpoint)
- [2026-03-17 16:55:00 -04:00] Implemented unified pairwise chat across organizer/admin/client dashboards, added private image/PDF chat attachments with auth-checked download routes, introduced explicit mark-read endpoints (GET no longer mutates read state), and kept legacy support/request chat API aliases as compatibility wrappers.

## 2026-03-17 (Checkpoint)
- [2026-03-17 23:09:31 -04:00] Implemented unified pairwise organizer/admin/client chat with private image+PDF attachments, explicit read endpoints, organizer chat consolidation, and legacy compatibility route wrappers.

## 2026-03-19 (Access code recovery, nav rework, chat fixes, UX polish)

### Nav rework (`frontend/src/App.jsx`)
- Nav links changed: Home → `/`, Organizer → `/dashboard`, Customer → `/client`, Scanner, Help. Admin link removed from nav (admin still accessible at `/admin/*`).
- Home link now goes to `/` directly. Dashboard component detects home mode via `location.pathname === "/"` (not `?home=1` param — that logic was updated in Dashboard.jsx).

### Access code / token recovery system (`frontend/src/pages/HelpPage.jsx`, `backend/controllers/chatController.js`, `backend/services/chatService.js`)
- Added "I lost my access code" link on the organizer support panel and "I lost my client access token" on the buyer support panel.
- Recovery creates an anonymous `ADMIN_CLIENT` conversation (reusing existing chat infrastructure). A unique recovery token is generated and shown to the requester — this IS the `clientAccessToken`.
- Type-specific localStorage keys: `qr-recovery:organizer:token` / `qr-recovery:organizer:conversationId` and equivalent `client:` keys so a user can hold both sessions simultaneously.
- Recovery form labels are type-aware (organizer name vs buyer name, event created vs event bought a ticket for).
- Message prefix sent to admin: `ORGANIZER ACCESS CODE RECOVERY REQUEST` or `CLIENT ACCESS TOKEN RECOVERY REQUEST` with name + event.
- Subject stored on conversation: `"Organizer Recovery: {name}"` or `"Client Recovery: {name}"` (requires backend restart to take effect for new requests).
- Admin inbox detects recovery conversations via subject prefix OR message content fallback (for pre-fix conversations). Shows name from subject/message, role badge "Organizer Recovery" / "Buyer Recovery".
- `chatController.js` `createSupportConversation`: reads `req.body.subject` instead of hardcoding `"Support conversation"`.
- Recovery requestors can upload image files in the chat thread (attach button, preview before send, images shown inline).
- `HelpPage` reads `?role=customer` URL param to jump directly to client recovery form (used by Client Dashboard "Lost your access token?" link).

### Client dashboard UX (`frontend/src/pages/ClientDashboardPage.jsx`)
- Added "Back to home" → `/` and "Lost your access token?" → `/help?tab=support&role=customer` links below the token input.

### Chat: client name fix in admin inbox (`frontend/src/pages/ClientDashboardPage.jsx`, `backend/services/chatService.js`)
- Root cause: "Message Admin" payload from ClientDashboardPage did not include `ticketRequestId`, so `ADMIN_CLIENT` conversations had no `ticketRequest` association → name showed as "Buyer".
- Fix: ClientDashboardPage now includes `ticketRequestId` in the ADMIN_CLIENT payload.
- `startConversationForActor` now forwards `ticketRequestId` to `ensureAdminClientConversation`.
- `ensureAdminClientConversation` accepts and stores `ticketRequestId` on new conversations, and backfills it on existing conversations that were missing it (on next interaction).

### Dashboard DateTimeInput (`frontend/src/pages/Dashboard.jsx`)
- Replaced both `datetime-local` inputs with a custom `DateTimeInput` component: native date picker + H / MM text inputs (digits only, max 2 chars) + AM / PM segmented radio toggle (both options always visible, selected = dark filled).
- Email preview section now starts collapsed by default (`showEmailPreview = false`).

### Public event page (`frontend/src/components/public/PublicEventExperience.jsx`)
- Shortened label from "Upload Payment Evidence (required, image, optimized before upload)" to "Upload Payment Evidence".

### Backend restart note
- `chatController.js` and `chatService.js` changes require backend restart. Backend uses `node index.js` (no nodemon). The recovery subject fix and `ticketRequestId` backfill both depend on the server picking up the new code.

## 2026-03-29 (Event controls, lifecycle banner, sales blocking, max tickets per email)

- **Schema** (`backend/prisma/schema.prisma`, migration `20260329000001_add_sales_controls`): Added 4 nullable fields to `UserEvent`: `salesCutoffAt` (DateTime), `salesWindowStart` (String HH:MM), `salesWindowEnd` (String HH:MM), `maxTicketsPerEmail` (Int).
- **Backend enforcement** (`backend/controllers/publicController.js`, `createPublicTicketRequest`): Blocks requests when cutoff passed, outside daily window, or buyer has reached max tickets per email (counting APPROVED + PENDING_VERIFICATION across all requests for that email on the event).
- **Public event page** (`frontend/src/components/public/PublicEventExperience.jsx`): Always-visible lifecycle banner (3 states: before start amber, after start amber, after end red). Amber badges for cutoff and window notices (hidden when sales closed). Request form hidden when any blocking condition active.
- **EXPIRED scanner outcome** (`backend/controllers/scanController.js`): New `EXPIRED` outcome fires when `scannedAt > (eventEndDate || eventDate)`. Ticket NOT marked USED. `TicketVerify.jsx` shows orange EXPIRED badge.
- **Past-date validation**: Frontend blocks saves when start date is in the past; backend enforces same on all 3 save paths. End date must be after start date.
- **Advanced settings UI** (`frontend/src/pages/Dashboard.jsx`): Collapsible "Advanced Settings" section (state: `advancedSettingsOpen`) appears above Save in all 3 event form locations. Exposes cutoff, window start/end, and max tickets per email. Sends `null` on clear to explicitly remove DB value.
- **12-hour time display**: `formatTime(HH:MM)` helper in `PublicEventExperience.jsx` converts stored 24h strings to 12h for display.

## 2026-04-02 (OG crawler redirect + client dashboard grouping)

- **OG crawler route** (`backend/index.js`): Added `GET /e/:slug` route served server-side for social crawlers. nginx routes bot User-Agents (Facebook, Twitter, etc.) to the backend; real users get the React SPA. Returns an HTML shell with full OG + Twitter card meta tags using event-specific title/description fetched from `userEvent` (by slug, `adminStatus: ACTIVE`). Fallback redirects to the live event page on DB error.
- **OG image** (`frontend/public/new_OG.png`): Replaced OG image; resized to 1200×630 for spec compliance.
- **`UserEvent` field name fix** (`backend/index.js`, ac8c124): Corrected field name in the OG route `select` to match actual Prisma schema column names.
- **Client dashboard ticket grouping** (`frontend/src/pages/ClientDashboardPage.jsx`): Tickets now grouped by event with collapsible sections per event.

## 2026-03-18 (Chat bug fix + Help page rework + Dashboard home rework)
- **Bug fix** (`backend/services/chatService.js`): `normalizeAccessCode()` was calling `.toUpperCase()` before DB lookup. Since `organizerAccessCode` is stored mixed-case in Postgres (case-sensitive), the lookup always failed → "Organizer scope not found." for organizers trying to send/read chat messages. Fixed by removing `.toUpperCase()` — now just `.trim()`. `listConversations` had previously worked only because it passed `?eventId=` triggering a secondary fallback in `requireOrganizerActor`.
- **Help page** (`frontend/src/pages/HelpPage.jsx`): Replaced the name/email/access-code support form with a role-selection flow. Three roles: organizer → redirected to `/dashboard`, ticket buyer → redirected to `/client`, visitor → redirected to FAQ tab. Each result panel has a Back button. Removed all legacy API calls, localStorage token logic, and `FeedbackBanner`.
- **Dashboard home** (`frontend/src/pages/Dashboard.jsx`): Added `handleGetStarted` (scrolls/focuses organizer name input), `handleAlreadyHaveCode` (shows access code entry, dispatches `qr-dashboard-code-entry` event), `handleBackToHome` (hides entry, dispatches `qr-dashboard-home-mode`). When "Already have code" is clicked, the generate/events section is hidden — only the access code input view is shown. Added tooltip on organizer name input in access-code-generation mode.
- **App nav** (`frontend/src/App.jsx`): Added `isDashboardEntry` state + listeners for `qr-dashboard-code-entry`/`qr-dashboard-home-mode` custom events. Nav always shows "Home" (`/dashboard?home=1`); "Dashboard" nav item appears only when `hasLoadedDashboard || isDashboardEntry`.
