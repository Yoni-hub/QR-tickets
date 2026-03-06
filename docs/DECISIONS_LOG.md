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
