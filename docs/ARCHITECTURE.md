# QR Tickets Architecture

Source of truth:
- This file is the canonical system/routing architecture summary for QR Tickets.
- Route registration in `frontend/src/App.jsx` is the implementation authority when this summary lags.

## Isolation Rules
- QR Tickets is a standalone product with no shared runtime code with Connsura.
- Separate git repository, backend, frontend, database, containers, AWS resources.
- Only shared items allowed: root domain ownership, SES, and Zoho mail.

## Environment Plan
- local: full stack on laptop with Docker Postgres.
- staging: optional placeholder environment for future use.
- prod: qr-tickets.connsura.com with blue/green rollout.

## Domain Mapping
- Production app: https://qr-tickets.connsura.com
- Local frontend: http://localhost:5174
- Local backend: http://localhost:4100

## Canonical Frontend Flow (2026-03-27)
- Root route (`/`) redirects to `/dashboard`.
- Organizer onboarding is dashboard-first with events-first pre-load mode.
- Organizer code is generated during first event save; full dashboard menu unlocks after organizer-code context is loaded.
- Active end-user routes: `/dashboard`, `/e/:eventSlug`, `/client`, `/t/:ticketPublicId`, `/help`, `/admin/*`.
- Scanner lives inside the organizer dashboard — no separate `/scanner` route.
- Admin accessible at `/admin/*` — not in public nav.
- As of 2026-03-14 (`b873f71`), homepage/how-it-works/demo routes are removed from the app shell.

## Ticket Delivery — ONE active method (as of 2026-03-27)

**The only delivery method is: Public Event Page → Organizer Approval → Client Dashboard.**

Flow:
1. Buyer visits `/e/:eventSlug`, fills form, verifies email via OTP, submits request
2. Organizer approves in dashboard (or auto-approve fires immediately)
3. Tickets generated, buyer emailed a link to their client dashboard (`/client?token=...`)
4. Buyer shows QR at door; scanner (inside organizer dashboard) validates it

### Removed delivery methods — do NOT re-implement
- **PDF Download**: removed from dashboard UI. `PDF_DOWNLOAD` enum and `TicketDelivery` model kept in DB/schema for historical data only.
- **Email "paste & send" (send-links)**: fully removed. `orderController.js` deleted 2026-03-27. No routes ever pointed to it after deprecation. `TicketDelivery` rows from old sends remain as read-only history.

### Schema artifacts kept intentionally
- `TicketDelivery` model — admin panel historical stats + mutation lock system
- `PDF_DOWNLOAD`, `EMAIL_LINK` enum values — mutation lock reads these for old events
- Do not remove without auditing `adminController.js` and `getEventTicketMutationLock()` in `eventController.js`

## Backend Controller Map (active controllers only)
- `eventController.js` — event CRUD, ticket generation, mutation lock
- `organizerController.js` — ticket requests, approve/reject, promoters, notifications
- `publicController.js` — public event page, OTP, ticket request submission, client dashboard
- `scanController.js` — QR ticket scanning
- `chatController.js` — pairwise chat (organizer/client/admin)
- `adminController.js` — admin panel (read-only stats + actions)
- `authController.js` — access code validation

### Deleted controllers
- `orderController.js` — deleted 2026-03-27. Was the email "send-links" delivery handler. Had zero registered routes.
