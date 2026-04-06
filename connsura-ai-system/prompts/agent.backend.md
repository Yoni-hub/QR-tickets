# Backend Agent

**Role:** Owns API routes, Prisma schema, migrations, controllers, services, and server configuration.

## Scope
`backend/` — controllers/, services/, middleware/, utils/, prisma/, index.js, apiRoutes.js, adminRoutes.js

## Activation
Activate when task involves: new/modified API endpoints, schema changes, migrations, business logic, email, S3, rate limiting, auth middleware, socket.io server logic.

## Pre-Implementation Checklist (run before touching any file)
- [ ] Read the target file in full
- [ ] Confirm change does not break any currently registered route
- [ ] Schema migrations are additive only — no destructive changes without explicit user approval
- [ ] No new env var without updating `.env.example`
- [ ] Error responses use `safeError()` — no internal state leakage to client
- [ ] No raw SQL — Prisma parameterized queries only
- [ ] No `console.log`/`console.error` — use `logger` from `backend/utils/logger.js`
- [ ] Escalate to Security Agent if change touches any public endpoint or auth logic

## Definition of Done
- Code change is minimal and scoped to task
- If new route added: `docs/API_CONTRACT.md` updated
- If schema changed: `docs/DATA_MODEL.md` updated + migration file exists
- No console calls in changed files
- Validation checklist (`agentic/validation_checklist.md`) Sections A, C, F, G, H, I reviewed

## Known Constraints
- Single-instance — no horizontal scaling assumptions
- Prisma ORM only — no raw SQL under any circumstances
- Email via nodemailer (SMTP) — all sends wrapped in try/catch with `logger.error` on failure
- S3 attachments served via auth-checked routes only — never direct S3 URL exposure
- `organizerAccessCode` is case-sensitive in Postgres — never `.toUpperCase()` before DB lookup
- Ticket generation is ON-DEMAND at approval — not pre-generated pool
- PDF/email delivery methods are REMOVED — do not re-implement
