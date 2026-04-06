# Audit Template

**File:** `agentic/audit_template.md`
**Purpose:** Standardizes how the system scans the repo, GitHub, and live site. Run this at the start of a deep audit cycle. Fill in every section — do not skip sections and mark N/A instead.

---

## AUDIT HEADER

```
Audit Date: [YYYY-MM-DD]
Auditor Role: [orchestrator / backend-agent / security-agent / qa-agent]
Audit Trigger: [session-start / weekly / bug-report / explicit-request]
Last Audit Date: [YYYY-MM-DD]
Changes Since Last Audit: [git log --oneline since last audit date]
```

---

## PART 1 — LOCAL REPOSITORY AUDIT

### 1.1 Repository Integrity
- [ ] Confirm active working directory = `C:\Users\yonat\Downloads\QR_Tickets` (DEC-005)
- [ ] Run `git status` — any uncommitted changes?
- [ ] Run `git log --oneline -10` — review recent commits for unexpected changes
- [ ] Confirm active branch is `main`
- [ ] Confirm remote is `https://github.com/Yoni-hub/QR-tickets.git`

### 1.2 Memory File Freshness
- [ ] `agentic/memory_system.json` — last_updated within last 3 sessions?
- [ ] `agentic/memory_product.json` — reflects current route map and flows?
- [ ] `agentic/memory_bugs.json` — open bugs still open? fixed bugs marked?
- [ ] `agentic/memory_tasks.json` — priorities still correct given recent commits?
- [ ] `agentic/memory_decisions.json` — any new decisions not yet recorded?

### 1.3 Documentation Alignment
- [ ] `docs/API_CONTRACT.md` — does it match current `backend/apiRoutes.js` + `adminRoutes.js`?
- [ ] `docs/DATA_MODEL.md` — does it match current `backend/prisma/schema.prisma`?
- [ ] `docs/ARCHITECTURE.md` — does it match current route map in `frontend/src/App.jsx`?
- [ ] `docs/SESSION_NOTES.md` — last session documented?
- [ ] `docs/DECISIONS_LOG.md` — last decision has a DEC-NNN entry?

### 1.4 Code Quality Scan
- [ ] Any `console.log` / `console.error` in `backend/controllers/`? (should use logger)
- [ ] Any hardcoded secrets or API keys in source files?
- [ ] Any `TODO` or `FIXME` comments in recently changed files?
- [ ] Any unused imports in recently changed files?
- [ ] Any `process.env.*` access without fallback or validation?
- [ ] Any new dependencies added to `package.json`? If yes, run `npm audit`.

### 1.5 Schema and Migration Audit
- [ ] Does `backend/prisma/schema.prisma` have a corresponding migration for every field?
- [ ] Run `npx prisma migrate status` — is schema up to date?
- [ ] Are there any fields added to schema but not documented in `docs/DATA_MODEL.md`?
- [ ] Are there any nullable fields that should be required, or vice versa?

### 1.6 Security Scan
- [ ] Run `npm audit` in `backend/` — any critical/high CVEs?
- [ ] Run `npm audit` in `frontend/` — any critical/high CVEs?
- [ ] Are all public POST/PATCH/DELETE endpoints covered by rate limiting?
- [ ] Are all public POST endpoints validating input with Zod schemas?
- [ ] Are all file uploads validating MIME type and size?
- [ ] Is `safeError()` used in all `catch` blocks that return error to client?
- [ ] Are any new admin routes missing the `requireAdminAccess` middleware?

### 1.7 Test Coverage Audit
- [ ] Run `npm test` in `backend/` — does it pass?
- [ ] List critical paths not covered by any test
- [ ] Are any new flows added this session covered by tests?

---

## PART 2 — GITHUB REPOSITORY AUDIT

### 2.1 Branch State
- [ ] Is `main` branch protected? (requires PR review, no direct push?)
- [ ] Are there any open PRs that have not been reviewed?
- [ ] Are there any stale branches (> 2 weeks old, not merged)?
- [ ] Is `main` up to date with remote?

### 2.2 CI/CD State
- [ ] Does `.github/workflows/ci.yml` exist?
  - If YES: did last CI run pass?
  - If NO: flag as TASK-006 (HIGH priority)
- [ ] Does `.github/workflows/deploy.yml` exist?
  - If YES: did last deploy run succeed?
  - If NO: deployment is manual — flag risk

### 2.3 Commit Quality
- [ ] Do recent commits follow `feat:|fix:|chore:|docs:` convention?
- [ ] Do recent commits have meaningful messages (not "wip" or "fix")?
- [ ] Are any commits directly to `main` (bypassing PR)?
- [ ] Do PRs have the rollback section filled in?

### 2.4 Release Safety
- [ ] Is there a git tag for the last production release?
- [ ] Is there a documented rollback procedure?
- [ ] Is there a staging environment to test before production?

---

## PART 3 — LIVE SITE AUDIT

**Target URL:** `https://qr-tickets.connsura.com`

### 3.1 Availability
- [ ] GET /health → 200 OK?
- [ ] Frontend loads at root URL?
- [ ] API responds at /api/public/events/:slug for a known event?

### 3.2 Public Event Page (`/e/:slug`)
- [ ] Page loads without JS errors (check browser console)
- [ ] Ticket types are displayed with correct prices
- [ ] Sales controls display correctly (banner visible when cutoff/window active)
- [ ] OTP flow works (email received, code accepted)
- [ ] Form submission creates a TicketRequest in DB
- [ ] Evidence upload works for paid events
- [ ] Sold-out state displays correctly when capacity reached
- [ ] Page is mobile-responsive at 375px

### 3.3 Organizer Dashboard (`/dashboard`)
- [ ] Dashboard loads with valid access code
- [ ] Event details display correctly
- [ ] Ticket request list loads and updates
- [ ] Approval action works and triggers ticket generation
- [ ] Rejection action works
- [ ] Scanner tab loads and camera activates
- [ ] Chat inbox loads and new messages appear
- [ ] Notification toggles work and auto-save
- [ ] Share Event button is visible and draggable

### 3.4 Client Dashboard (`/client`)
- [ ] Dashboard loads with valid clientAccessToken
- [ ] Approved tickets are visible grouped by event
- [ ] QR code images render correctly
- [ ] Ticket price and type display correctly
- [ ] Chat with organizer works

### 3.5 Scanner
- [ ] Scanner initializes camera correctly
- [ ] Manual ID entry works as fallback
- [ ] VALID scan shows correct attendee info
- [ ] USED scan shows correct "already used" state
- [ ] INVALID scan shows red error state
- [ ] EXPIRED scan shows orange expired state

### 3.6 Admin Panel (`/admin`)
- [ ] Admin panel loads with correct x-admin-key
- [ ] Overview stats are plausible (not 0 for an active system)
- [ ] Event list shows all events
- [ ] Audit log shows recent actions
- [ ] Support/chat inbox loads

### 3.7 Performance
- [ ] Public event page loads in < 3 seconds on mobile
- [ ] Dashboard loads in < 3 seconds
- [ ] Scanner activates camera in < 5 seconds
- [ ] Large ticket lists (50+ tickets) paginate correctly

### 3.8 Social Preview
- [ ] `/e/:slug` served with OG meta tags to curl User-Agent?
  - `curl -A "facebookexternalhit/1.1" https://qr-tickets.connsura.com/e/:slug`
  - Verify `<meta property="og:title">` is event-specific
- [ ] OG image loads correctly

### 3.9 Known Broken States
- [ ] Any 404 pages that should exist?
- [ ] Any broken navigation links?
- [ ] Any console errors on page load?
- [ ] Any UI states that show raw `[object Object]` or `undefined`?

---

## PART 4 — AGENTIC MATURITY RE-EVALUATION

Re-score after completing parts 1-3.

| Dimension | Previous Score | Current Score | Delta | Notes |
|---|---|---|---|---|
| Product Intelligence | | | | |
| Engineering Autonomy | | | | |
| QA Autonomy | | | | |
| Security Awareness | | | | |
| Operational Autonomy | | | | |
| Memory/Context Handling | | | | |
| Orchestration Maturity | | | | |
| Self-Improvement Capability | | | | |
| **OVERALL** | **1.5** | | | |

---

## AUDIT OUTPUT

After completing the audit, generate:
1. Update `agentic/memory_bugs.json` with any new issues found
2. Update `agentic/memory_tasks.json` with new or re-prioritized tasks
3. Update `agentic/memory_system.json` with any changed facts
4. Write audit summary to `docs/SESSION_NOTES.md`

---

## AUDIT HISTORY

| Date | Trigger | Auditor | New Bugs | Closed Bugs | Score Delta |
|---|---|---|---|---|---|
| 2026-04-05 | initial-audit | orchestrator | 10 | 0 | baseline 1.5 |
