# Validation Checklist

**File:** `agentic/validation_checklist.md`
**Purpose:** Mandatory checklist applied by the QA Agent after every implementation. Mark each item: ✅ PASS | ❌ FAIL | ⬜ N/A | 🔲 NEEDS-FOLLOW-UP

---

## HOW TO USE

1. After every implementation, open this checklist
2. Identify which sections apply to the change
3. Work through every applicable item
4. Log any ❌ FAIL as a new entry in `agentic/memory_bugs.json`
5. Log any 🔲 NEEDS-FOLLOW-UP as a task in `agentic/memory_tasks.json`
6. Record checklist result in the session notes

---

## SECTION A — HAPPY PATH

The primary intended use case works correctly end-to-end.

- [ ] A1 — The feature/fix does what the task specification says it should do
- [ ] A2 — The API endpoint returns the correct HTTP status code (200/201/204 for success)
- [ ] A3 — The response payload matches the documented shape in `docs/API_CONTRACT.md`
- [ ] A4 — The UI component renders correctly with real data
- [ ] A5 — Database records are created/updated/deleted as expected
- [ ] A6 — Email notifications fire when they should (if applicable)
- [ ] A7 — Real-time WebSocket events emit and are received correctly (if applicable)
- [ ] A8 — The complete user flow works from start to finish without errors

---

## SECTION B — EDGE CASES

Boundary conditions and unusual-but-valid inputs.

- [ ] B1 — Empty optional fields are handled gracefully (no crashes on `undefined`)
- [ ] B2 — Maximum-length inputs are accepted without truncation errors
- [ ] B3 — Special characters in text fields (apostrophes, quotes, Unicode) do not break queries
- [ ] B4 — Date/time edge cases: end of month, leap year, midnight, timezone boundaries
- [ ] B5 — Zero-quantity selections are rejected correctly (if applicable)
- [ ] B6 — Single item vs. list: works correctly with both one and many items
- [ ] B7 — Concurrent actions do not cause race conditions (e.g., double-approval)

---

## SECTION C — INVALID INPUT

Malformed, missing, or out-of-range inputs are rejected cleanly.

- [ ] C1 — Missing required fields return 400 with a clear error message (not 500)
- [ ] C2 — Wrong field types (string where number expected) are caught and rejected
- [ ] C3 — Negative numbers are rejected where only positive values make sense
- [ ] C4 — Strings exceeding max length are rejected or truncated (not silently accepted)
- [ ] C5 — Invalid enum values return 400 (not a Prisma crash)
- [ ] C6 — Malformed email addresses are rejected
- [ ] C7 — Empty strings are treated as missing (not stored as empty)
- [ ] C8 — Arrays with invalid items are rejected entirely, not partially accepted
- [ ] C9 — Array fields with nested invalid items produce field-specific error paths (e.g., `ticketSelections[0].quantity` not just "invalid input")

---

## SECTION D — DUPLICATE ACTIONS

Idempotency and double-submission protection.

- [ ] D1 — Approving an already-approved ticket request does not create duplicate tickets
- [ ] D2 — Scanning a ticket twice returns USED on second scan, not VALID
- [ ] D3 — Submitting a ticket request twice with same email is handled (maxTicketsPerEmail check)
- [ ] D4 — Generating tickets twice for the same event does not duplicate existing tickets
- [ ] D5 — OTP verification with expired token is rejected
- [ ] D6 — Re-sending OTP does not allow both tokens to be valid simultaneously (if applicable)
- [ ] D7 — Double-clicking a submit button does not create duplicate records

---

## SECTION E — MOBILE BEHAVIOR

The change works correctly at mobile viewport widths.

- [ ] E1 — Layout is usable at 375px width (iPhone SE)
- [ ] E2 — Touch targets are at least 44px in height (buttons, links)
- [ ] E3 — No horizontal overflow or content clipping on mobile
- [ ] E4 — Modal/overlay is dismissible on mobile (tap outside or close button)
- [ ] E5 — Form inputs do not trigger unwanted zoom on mobile (font-size >= 16px)
- [ ] E6 — Scanner camera view is usable on mobile
- [ ] E7 — Long text (event names, addresses) wraps correctly, does not overflow

---

## SECTION F — PERMISSION AND SECURITY CHECKS

Access control, authorization, and input safety.

- [ ] F1 — Organizer-scoped endpoints reject requests from wrong access codes
- [ ] F2 — Admin endpoints return 401/403 when x-admin-key is missing or wrong
- [ ] F3 — Client dashboard endpoints reject wrong or expired clientAccessTokens
- [ ] F4 — Cross-event ticket access is blocked (scan returns INVALID for wrong organizer)
- [ ] F5 — File uploads reject non-image/non-PDF MIME types
- [ ] F6 — File uploads enforce size limit (20MB per nginx config)
- [ ] F7 — Error responses do not leak stack traces or internal error messages
- [ ] F8 — No new environment variables are hardcoded in source code
- [ ] F9 — New public endpoint has rate limiting applied
- [ ] F10 — New public endpoint has Turnstile CAPTCHA where appropriate
- [ ] F11 — HTML is stripped from all user-supplied text inputs
- [ ] F12 — No raw SQL introduced (Prisma parameterized queries only)

---

## SECTION G — REGRESSION CHECKS

Existing working behavior is not broken.

- [ ] G1 — Ticket request submission flow still works end-to-end
- [ ] G2 — Organizer approval generates tickets and sends client dashboard link
- [ ] G3 — QR scan returns correct outcomes (VALID, USED, INVALID, EXPIRED)
- [ ] G4 — OTP verification still gates event publishing and buyer submission
- [ ] G5 — Chat messages still deliver in real time via WebSocket
- [ ] G6 — Admin panel still loads and returns data correctly
- [ ] G7 — Client dashboard still shows approved tickets
- [ ] G8 — Public event page still renders for active events
- [ ] G9 — Sales controls (cutoff, window, max per email) still enforce correctly
- [ ] G10 — Scan guard (20-attempt block) still activates on excessive invalid scans
- [ ] G11 — OG meta tags still render for social crawler User-Agents
- [ ] G12 — Frontend displays user-friendly error messages (not raw JSON) for 400 responses on all public forms

---

## SECTION H — OBSERVABILITY AND ERROR HANDLING

The change is diagnosable when it fails in production.

- [ ] H1 — Errors are logged with `logger.error()`, not `console.error()`
- [ ] H2 — Errors include enough context to diagnose without reproduction (request ID, user context)
- [ ] H3 — Caught errors do not silently swallow failures (at least log before continuing)
- [ ] H4 — HTTP 500 responses are logged with full stack trace server-side
- [ ] H5 — Background operations (email, S3 upload) have failure handling and logging

---

## SECTION I — DOCUMENTATION

The change is reflected in the documentation layer.

- [ ] I1 — If a new API route was added: `docs/API_CONTRACT.md` is updated
- [ ] I2 — If schema changed: `docs/DATA_MODEL.md` is updated and migration file exists
- [ ] I3 — If a product decision was made: `docs/DECISIONS_LOG.md` is updated
- [ ] I4 — `agentic/memory_bugs.json` reflects current bug states (new bugs added, fixed bugs marked)
- [ ] I5 — `agentic/memory_tasks.json` reflects current task states
- [ ] I6 — Session notes updated with a summary of what changed

---

## CRITICAL PATH SMOKE TESTS

Run these manually (or via test suite when tests exist) after any change to a shared flow.

### Smoke 1 — Ticket Request + Approval
1. Visit `/e/:slug` for an active event
2. Fill in name, email, phone, select ticket type
3. Submit (upload evidence for paid events)
4. Verify OTP received and accepted
5. Verify TicketRequest created in DB with PENDING_VERIFICATION
6. Approve in organizer dashboard
7. Verify tickets created in DB
8. Verify buyer receives email with client dashboard link
9. Visit `/client?token=...` and verify tickets visible with QR codes

### Smoke 2 — QR Scan
1. Get a valid ticketPublicId from an approved ticket
2. POST /api/scans with correct accessCode → expect VALID
3. POST /api/scans again → expect USED
4. POST /api/scans with wrong accessCode → expect INVALID
5. POST /api/scans with invalidated ticket → expect INVALID

### Smoke 3 — OTP Gate
1. Create a new event without email verified
2. Confirm event does not appear as published
3. Trigger OTP send to organizer email
4. Verify OTP
5. Confirm event now appears as published

### Smoke 4 — Chat
1. Create an ORGANIZER_CLIENT conversation
2. Send a message as organizer
3. Verify socket.io "new_message" event fires to client room
4. Send reply as client
5. Verify unread badge increments for organizer

### Smoke 5 — Admin
1. Load `/admin/overview` with correct x-admin-key
2. Verify event list loads
3. Disable an event → verify adminStatus changes to DISABLED
4. Re-enable → verify ACTIVE
5. Load audit log → verify disable/enable actions appear
