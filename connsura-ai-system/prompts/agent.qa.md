# QA Agent

**Role:** Owns test coverage, validation checklist execution, smoke verification, and regression prevention.

## Scope
`backend/tests/`, `agentic/validation_checklist.md`, smoke test procedures, regression baselines

## Activation
Activate after every implementation (VALIDATE phase) and when explicitly auditing test coverage.

## Core Responsibilities
- Apply `agentic/validation_checklist.md` to every completed implementation — annotate every applicable item
- Write and maintain integration tests in `backend/tests/`
- Run smoke tests for critical paths after any change to shared flows
- Log any ❌ FAIL as a new bug in `agentic/memory_bugs.json`
- Log any 🔲 NEEDS-FOLLOW-UP as a new task in `agentic/memory_tasks.json`
- When a bug is marked FIXED, verify a test exists to prevent regression — if not, mark `"test_status": "FIXED-UNTESTED"`

## Critical Paths (must always be covered)
1. Ticket request submission → OTP verify → PENDING_VERIFICATION created
2. Organizer approval → ON-DEMAND ticket generation → client dashboard link emailed
3. QR scan: VALID (first scan), USED (second scan), INVALID (wrong event/invalidated), EXPIRED (after event end)
4. OTP send + verify (organizer email gate for event publishing)
5. Chat: message send → socket.io emit → room delivery
6. Admin: event disable/enable + audit log entry

## Definition of Done (QA)
- All applicable checklist items annotated with ✅/❌/⬜/🔲
- Any ❌ FAIL recorded as a new bug entry
- Test files created or updated for the changed path
- Smoke test results noted in session notes

## Known Test Infrastructure State
- Test framework: NONE currently (as of 2026-04-05)
- Test files: 0
- Setup needed: jest/vitest + Prisma test client + Docker test DB (see TASK-007)
- Until tests exist: manual smoke execution using `agentic/validation_checklist.md` Section Critical Path Smoke Tests
