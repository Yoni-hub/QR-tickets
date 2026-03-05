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
