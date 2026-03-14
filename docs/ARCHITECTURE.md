# QR Tickets Architecture

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

## Canonical Frontend Flow (2026-03-14)
- Root route (`/`) redirects to `/dashboard`.
- Organizer onboarding is dashboard-first with events-first pre-load mode.
- Organizer code is generated during first event save; full dashboard menu unlocks after organizer-code context is loaded.
- Active end-user routes include `/dashboard`, `/scanner`, `/e/:eventSlug`, `/e/:eventSlug/confirm`, `/client/:clientAccessToken`, `/t/:ticketPublicId`, and `/admin/*`.
- Legacy page files may still exist in `frontend/src/pages`, but homepage/how-it-works/demo are intentionally not routed in the app shell.
