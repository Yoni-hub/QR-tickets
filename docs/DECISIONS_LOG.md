# Decisions Log

## DEC-001 (2026-03-05)
- Context: New QR Tickets architecture.
- Decision: Full isolation from Connsura runtime and infrastructure.
- Consequence: Independent repo, DB, containers, CI/CD.

## DEC-002 (2026-03-05)
- Context: Ticket access control.
- Decision: 6-char alphanumeric accessCode unique on UserEvent.
- Consequence: Organizer dashboard/scanner login by access code.

## DEC-003 (2026-03-05)
- Context: QR payload consistency and user verification.
- Decision: Encode QR as `${PUBLIC_BASE_URL}/t/${ticketPublicId}` and expose `/t/:ticketPublicId` informational page.
- Consequence: camera scanner can parse URL or raw fallback; users can verify ticket state without consuming it.

## DEC-004 (2026-03-05)
- Context: Prevent context loss when starting new chats and enforce consistent memory hygiene.
- Decision: Require automatic session checkpoints (scripted + documented) at handoff, major change batches, and explicit `checkpoint` requests.
- Consequence: `SESSION_NOTES`, `DECISIONS_LOG`, and interface docs stay current across chat boundaries.

## DEC-005 (2026-03-06)
- Context: Duplicate local repositories caused path confusion and risk of editing the wrong copy.
- Decision: Treat `C:\Users\yonat\Downloads\QR_Tickets` as the single active working repository; `C:\Users\yonat\OneDrive\Desktop\QR_Tickets` is archived/read-only unless explicitly requested.
- Consequence: All future implementation and context loading default to the Downloads repository path.

## DEC-006 (2026-03-08)
- Context: Need internal system-level controls without introducing full auth/roles yet.
- Decision: Protect admin APIs with an environment-driven shared key (`ADMIN_PANEL_KEY`) using `x-admin-key` middleware.
- Consequence: Admin panel is usable immediately for internal operations, with a clear migration path to role-based auth later.

## DEC-007 (2026-03-08)
- Context: Club/nightlife workflows require manual payment confirmation before ticket issuance.
- Decision: Introduce `TicketRequest` lifecycle (`PENDING_VERIFICATION`, `APPROVED`, `REJECTED`) and issue tickets only on organizer approval.
- Migration note: Renamed from `PENDING_PAYMENT` to `PENDING_VERIFICATION` on 2026-03-17.
- Consequence: Payment remains off-platform while ticket issuance is controlled and auditable.

## DEC-008 (2026-03-08)
- Context: Promoter-led sales links need attribution for requests, approvals, and door scans.
- Decision: Add per-event `Promoter` entities with referral links (`/e/:slug?ref=:code`) and attach promoter IDs to ticket requests and tickets.
- Consequence: Dashboard can show promoter leaderboard and operational metrics without changing scan rules.

## DEC-009 (2026-03-08)
- Context: Access control and operator workflow center on event access codes, not account identities.
- Decision: Keep all organizer operational actions scoped to event `accessCode` (ticket generation, requests, promoters, guest import).
- Consequence: Every dashboard action is bound to the currently loaded event context and avoids cross-event leakage.

## DEC-010 (2026-03-13)
- Context: Preview fidelity and post-sale cancellation now span shared frontend rendering, organizer dashboard actions, buyer client dashboard state, and backend ticket/request records.
- Decision: Use one shared public-event renderer for live and preview views, and model cancellations as explicit ticket/request metadata with organizer-authored buyer messages for public-page sales.
- Consequence: UI changes to the public event page now reflect in preview automatically, and cancelled public-page tickets can show reason/evidence consistently across organizer and buyer surfaces.

## DEC-012 (2026-03-29)
- Context: Sales window open/close times need to be stored and compared against local event time regardless of server timezone.
- Decision: Store `salesWindowStart` / `salesWindowEnd` as `HH:MM` strings (24h) rather than UTC DateTimes. Comparison is done in the server's local minute-of-day (`new Date()` → hours * 60 + minutes).
- Consequence: Simple, timezone-portable storage; no DateTime arithmetic; display conversion (24h → 12h) done in `formatTime()` helper on the frontend.

## DEC-013 (2026-04-02)
- Context: Social sharing links for `/e/:slug` event pages showed the SPA shell with no meaningful OG meta tags because crawlers can't execute JavaScript.
- Decision: Add a backend `GET /e/:slug` route in `index.js` that serves a static HTML shell with OG/Twitter card meta tags. nginx routes known crawler User-Agents to the backend; real users continue to get the React SPA directly.
- Consequence: Social previews (WhatsApp, Facebook, Twitter) show event-specific title, description, and image. No change to the frontend routing or React render path for real users.

## DEC-011 (2026-03-17)
- Context: Needed one coherent messaging system without 3-party threads while preserving legacy flows.
- Decision: Enforced strict pairwise chat model and routed all new reads/writes through unified chat service with compatibility aliases.
- Consequence: Consistent chat UX across dashboards, controlled access by actor scope, and safer attachment handling with private authorization-checked retrieval.
