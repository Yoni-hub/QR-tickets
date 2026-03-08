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
- Decision: Introduce `TicketRequest` lifecycle (`PENDING_PAYMENT`, `APPROVED`, `REJECTED`) and issue tickets only on organizer approval.
- Consequence: Payment remains off-platform while ticket issuance is controlled and auditable.

## DEC-008 (2026-03-08)
- Context: Promoter-led sales links need attribution for requests, approvals, and door scans.
- Decision: Add per-event `Promoter` entities with referral links (`/e/:slug?ref=:code`) and attach promoter IDs to ticket requests and tickets.
- Consequence: Dashboard can show promoter leaderboard and operational metrics without changing scan rules.

## DEC-009 (2026-03-08)
- Context: Access control and operator workflow center on event access codes, not account identities.
- Decision: Keep all organizer operational actions scoped to event `accessCode` (ticket generation, requests, promoters, guest import).
- Consequence: Every dashboard action is bound to the currently loaded event context and avoids cross-event leakage.
