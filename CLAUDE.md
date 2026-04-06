# Claude Code — Operating Instructions for QR Tickets

This file is loaded automatically by Claude Code at the start of every session.
These instructions override default behavior and are mandatory.

---

## ACTIVE REPO

Always work in: `C:\Users\yonat\Downloads\QR_Tickets`
Never use: `C:\Users\yonat\OneDrive\Desktop\QR_Tickets` (archived copy — DEC-005)

---

## MANDATORY SESSION START PROTOCOL

Before doing ANYTHING else at the start of every session:

1. Read `agentic/memory_system.json`
2. Read `agentic/memory_bugs.json` (open bugs only)
3. Read `agentic/memory_tasks.json` (P0 and P1 tasks)
4. Run `git log --oneline -10` to see recent changes
5. Run `git status` to check uncommitted state
6. Report: "Loaded Project Context | Active Tools | Memory Gaps" (see `docs/context-check.md`)

Do not skip this. Do not proceed to implementation without completing it.

---

## AGENT LOOP — MANDATORY OPERATING CYCLE

Follow `agentic/agent_loop.md` for every work cycle:

```
SCAN → ANALYZE → PRIORITIZE → IMPLEMENT → VALIDATE → STORE → REPEAT
```

Never skip ANALYZE before IMPLEMENT.
Never skip VALIDATE before STORE.
Never implement two tasks in one cycle.

---

## ROLE SYSTEM

Before starting any task, identify which role applies:

- **Backend Agent** — API, Prisma schema, migrations, controllers, services
- **Frontend Agent** — React components, pages, routing, UI state
- **QA Agent** — Tests, validation checklist, smoke verification
- **Security Agent** — Public endpoints, auth, file uploads, input validation
- **Ops Agent** — Docker, nginx, CI/CD, deploy scripts

See `agentic/roles.md` for full scope definitions.

---

## IMPLEMENTATION RULES

- Read every file completely before editing it
- Make the smallest change that solves the problem
- Do not refactor, clean up, or "improve" code outside the task scope
- Do not add features not explicitly requested
- Do not add comments, docstrings, or type annotations to unchanged code
- Preserve existing working behavior — if it works, don't touch it
- Every new backend route must have a corresponding `docs/API_CONTRACT.md` update
- Every schema change must have a migration file and `docs/DATA_MODEL.md` update

---

## VALIDATION — MANDATORY AFTER EVERY IMPLEMENTATION

Apply `agentic/validation_checklist.md` after every change.
A task is NOT complete until validation passes.
Any failing check = new bug in `agentic/memory_bugs.json`.

---

## MEMORY MAINTENANCE — MANDATORY AFTER EVERY CYCLE

After every completed task:
1. Update `agentic/memory_bugs.json` (new bugs found, fixed bugs marked)
2. Update `agentic/memory_tasks.json` (completed tasks, status changes)
3. Update `docs/SESSION_NOTES.md` with what changed
4. If API changed: update `docs/API_CONTRACT.md`
5. If schema changed: update `docs/DATA_MODEL.md`
6. If a major decision was made: update `docs/DECISIONS_LOG.md` + `agentic/memory_decisions.json`

---

## CHECKPOINT COMMAND

When user says `checkpoint`:
1. Immediately run STORE step
2. Run `ops/checkpoint.ps1` with appropriate flags
3. Confirm all memory files are current
4. Output: what was stored and what the next recommended task is

---

## MEMORY STALENESS RULE

Before using any memory file for a decision:
- If its `last_updated` date is more than 3 commits behind the most recent `git log` date, treat it as POTENTIALLY_STALE
- Cross-verify its claims against the actual code before trusting them
- If a memory file conflicts with another memory file, read the code and update both — see `agentic/agent_loop.md` Step 2 Conflict Resolution Procedure

## TASK STATUS RULE

Valid task statuses: `READY` | `IN_PROGRESS` | `COMPLETE` | `PENDING` | `BLOCKED`
- Set `IN_PROGRESS` immediately when starting a task — before touching any files
- Set `COMPLETE` only after VALIDATE passes
- A task cannot move from `IN_PROGRESS` to `COMPLETE` in a single step — VALIDATE must run first
- `FIXED-UNTESTED` is a valid bug status: bug is fixed in code but no test prevents regression

## ESCALATE TO USER WHEN

- A task has unknown scope (cannot identify affected files)
- A change requires modifying a live production flow in a breaking way
- A CRITICAL security vulnerability is discovered
- A memory file conflicts with code reality and the correct state is ambiguous
- Estimated complexity exceeds what fits in one safe session

---

## WHAT NOT TO DO

- Do not implement product features before Phase 1 engineering foundation is complete
- Do not bypass security controls (no `--no-verify`, no skipping rate limiting, no removing CSRF)
- Do not create files unless necessary
- Do not guess at behavior — read the actual code
- Do not assume memory files are current — verify against code when it matters
- Do not work on more than one task per cycle
- Do not commit without a meaningful commit message following `feat:|fix:|chore:|docs:` convention

---

## CURRENT PHASE

**Phase 1 — Engineering + Agentic Foundation**
Priority order: TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005 → TASK-006 → TASK-007 → TASK-008 → TASK-009

Do not start Phase 2 tasks until all Phase 1 P0/P1 tasks are complete.
Phase 2 and Phase 3 tasks are defined in `agentic/memory_tasks.json`.

---

## AGENTIC MATURITY BASELINE

Current score: **1.5/10** (as of 2026-04-05)
Target after Phase 1: **4.5/10**
Target after Phase 2: **7.0/10**
Target after Phase 3: **9.0/10**

Track progress in `agentic/memory_system.json` → `agentic_maturity`.
