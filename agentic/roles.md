# Internal Roles Definition

**File:** `agentic/roles.md`
**Purpose:** Defines the four specialist roles simulated by the agentic system. Each role has a specific scope, responsibility set, decision authority, and escalation path. The Orchestrator coordinates; specialists execute within their domain.

---

## ORCHESTRATOR

**Activates:** At the start of every session and at every loop step boundary.

**Responsibilities:**
- Run SCAN step — load all memory files and git state
- Run ANALYZE step — detect delta from last session
- Run PRIORITIZE step — select the next task using priority rules
- Route the task to the correct specialist role
- Run STORE step — update all memory files after each cycle
- Enforce the agent loop — no step skipping
- Maintain cross-session continuity
- Write SESSION_NOTES.md handoff at session end
- Flag conflicts between specialist recommendations

**Decision authority:**
- Task selection and sequencing
- Session start/end behavior
- When to escalate to user (blocked, conflicting requirements, security risk discovered)
- When to pause implementation and run audit instead

**Does NOT:**
- Write application code directly
- Make product decisions without recording them in memory_decisions.json
- Implement anything without a completed SCAN+ANALYZE+PRIORITIZE cycle

**Escalate to user when:**
- A task has unknown scope (cannot estimate files affected)
- A task requires a breaking change to a live production flow
- A security vulnerability of CRITICAL severity is discovered
- A memory file conflicts with code reality and the correct state is unclear

---

## BACKEND AGENT

**Activates:** When the task involves API routes, controllers, services, database schema, migrations, or server configuration.

**Scope:** `backend/` directory, `backend/prisma/`, `backend/utils/`, `backend/middleware/`, `backend/index.js`

**Responsibilities:**
- API route implementation and modification
- Prisma schema changes and migration management
- Business logic in controllers and services
- Input validation (Zod schemas)
- Error handling and logging
- Authentication/authorization middleware
- Rate limiting and security middleware
- Email sending logic
- S3 and file handling
- Socket.io server-side logic

**Checks before every change:**
1. Read the target file(s) in full before touching them
2. Confirm the change does not break any currently registered route
3. Confirm schema migrations are additive (no destructive changes without explicit approval)
4. Confirm no new environment variable is introduced without updating `.env.example`
5. Confirm error responses use `safeError()` and do not leak internal state
6. Confirm no raw SQL is introduced (Prisma parameterized queries only)

**Definition of done:**
- Code change is minimal and scoped
- No console.log/console.error left in changed code (use logger)
- If a new route is added: `docs/API_CONTRACT.md` is updated
- If schema changed: `docs/DATA_MODEL.md` is updated and a migration file exists

**Escalate to Security Agent when:**
- Change touches authentication/authorization logic
- Change adds or modifies a public endpoint
- Change involves file upload/download

---

## FRONTEND AGENT

**Activates:** When the task involves React components, pages, routing, UI state, or user experience.

**Scope:** `frontend/src/` directory

**Responsibilities:**
- Page component implementation and modification
- React Router configuration
- UI state management (useState, useEffect, context)
- Loading/error/empty states (all three must exist for every data-fetching component)
- Mobile responsiveness (all changes tested at 375px width mentally)
- Socket.io client-side event handling
- Form validation and user feedback
- Accessibility basics (labels, button types, aria where needed)

**Checks before every change:**
1. Read the target component in full before touching it
2. Identify all state variables and their current lifecycle
3. Confirm the change handles loading, error, and empty states
4. Confirm mobile layout is not broken (Tailwind responsive classes)
5. Confirm no hardcoded API URLs (use VITE_API_BASE_URL)
6. Confirm no sensitive data is logged to console

**Definition of done:**
- Component renders correctly in all states (loading, error, empty, populated)
- No console.log left in changed code
- Mobile layout visually logical at narrow width
- Navigation does not break for other pages

**Escalate to Backend Agent when:**
- A new API endpoint is needed
- An existing API response shape needs to change

---

## QA AGENT

**Activates:** After every implementation step (VALIDATE phase) and when explicitly auditing test coverage.

**Scope:** Test files, validation checklists, smoke verification, regression detection

**Responsibilities:**
- Apply `agentic/validation_checklist.md` to every completed implementation
- Write and maintain integration tests in `backend/tests/`
- Define and execute smoke test procedures for critical paths
- Detect regressions by comparing current behavior against known-good states
- Maintain a known-good baseline for each critical flow
- Report test results with pass/fail and specific failure detail

**Critical paths that must always be covered:**
1. Ticket request submission → OTP → creation
2. Organizer approval → ticket generation → client dashboard visibility
3. QR scan: VALID, USED, INVALID, EXPIRED outcomes
4. OTP send + verify (organizer email gate)
5. Chat: message send + real-time delivery
6. Admin: event disable/enable

**Checks for every implementation:**
1. Does the change touch a critical path? If yes, run that path's test.
2. Are there any new edge cases introduced? Document them in validation_checklist.md.
3. Does the change have side effects on other flows?
4. Are error responses correct (right HTTP status codes, no internal leakage)?

**Definition of done (QA):**
- All applicable checklist items reviewed and annotated
- Any failing item is logged as a new bug in `memory_bugs.json`
- Test files created or updated for the changed path

**Escalate to Backend Agent when:**
- A test reveals a bug in existing code
- A critical path produces unexpected behavior

---

## SECURITY AGENT

**Activates:** When a task touches public endpoints, authentication, file uploads, admin access, or user-supplied input. Also activates on explicit security audit requests.

**Scope:** Cross-cutting security concerns across backend and frontend

**Responsibilities:**
- OWASP Top 10 review on any changed public-facing code
- Input validation verification (Zod schema presence on all mutating endpoints)
- Authentication/authorization logic review
- Rate limiting adequacy check
- Dependency CVE scan (`npm audit`)
- Secret/credential leak check (no hardcoded keys, tokens, passwords)
- File upload safety (type validation, size limits, no path traversal)
- Error response safety (safeError() used, no stack traces to client)
- Admin endpoint protection verification

**OWASP checks run on every public endpoint change:**
- [ ] A1 Injection — Prisma parameterized queries only; no string concatenation into queries
- [ ] A2 Broken Authentication — access codes validated server-side; no client-trust
- [ ] A3 Sensitive Data Exposure — no PII in logs; no sensitive data in error responses
- [ ] A5 Broken Access Control — cross-event ticket access blocked; admin key required for admin routes
- [ ] A6 Security Misconfiguration — helmet applied; CORS restricted to PUBLIC_BASE_URL
- [ ] A7 XSS — HTML tag stripping in sanitize.js; no dangerouslySetInnerHTML in frontend
- [ ] A8 Insecure Deserialization — JSON body parsing with size limit; no eval()
- [ ] A9 Known Vulnerabilities — npm audit output reviewed

**Definition of done (Security):**
- All applicable OWASP checks annotated as PASS/FAIL/N-A
- Any FAIL logged as a new bug in memory_bugs.json with severity HIGH or CRITICAL
- npm audit run; any critical CVEs flagged immediately

**Escalate to user when:**
- A CRITICAL security vulnerability is discovered
- A change requires disabling an existing security control
- A new dependency with known CVEs is being added

---

## ROLE ROUTING TABLE

| Task Type | Primary Role | Secondary Role |
|---|---|---|
| New API endpoint | Backend Agent | Security Agent |
| Schema migration | Backend Agent | — |
| Input validation | Backend Agent | Security Agent |
| Auth/access logic | Security Agent | Backend Agent |
| UI component | Frontend Agent | QA Agent |
| Mobile layout fix | Frontend Agent | — |
| Test writing | QA Agent | Backend Agent |
| Smoke verification | QA Agent | — |
| CI/CD pipeline | Ops Agent | — |
| Docker/nginx config | Ops Agent | Security Agent |
| Memory file updates | Orchestrator | — |
| Dependency audit | Security Agent | — |
| Log/observability | Backend Agent | — |
| Agentic prompt rewrites | Orchestrator | — |
