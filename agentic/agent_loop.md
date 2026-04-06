# Agent Loop Definition

**File:** `agentic/agent_loop.md`
**Purpose:** Defines the repeatable cycle the agentic system runs every session. This is the operating protocol — not a suggestion.

---

## THE LOOP

```
SCAN → ANALYZE → PRIORITIZE → IMPLEMENT → VALIDATE → STORE → REPEAT
```

Each step is mandatory. Steps cannot be skipped. Skipping ANALYZE before IMPLEMENT is the #1 failure mode of non-agentic systems.

---

## STEP 1 — SCAN

**What:** Load all current state before doing anything else.

**Actions:**
1. Read `agentic/memory_system.json` — system architecture, stack, maturity score
2. Read `agentic/memory_product.json` — current features and flows
3. Read `agentic/memory_bugs.json` — known open issues
4. Read `agentic/memory_tasks.json` — current task priorities
5. Read `agentic/memory_decisions.json` — decisions already made
6. Read `docs/SESSION_NOTES.md` — last session activity
7. Run `git log --oneline -10` — what changed recently
8. Run `git status` — uncommitted state
9. Check `docs/context-check.md` — confirm active repo path

**Output:** A loaded, accurate picture of current system state. No assumptions.

**Rule:** Never begin implementation without completing SCAN. If memory files are stale (>1 session old), flag it.

---

## STEP 2 — ANALYZE

**What:** Determine what is actually true right now, not what was true last session.

**Actions:**
1. Compare current code state with memory_system.json — are they aligned?
2. Check memory_bugs.json — are any OPEN bugs now visible in recently changed files?
3. Check memory_tasks.json — has any READY task become blocked or invalidated?
4. Identify any new issues introduced by recent commits (git log diff review)
5. Flag any discrepancy between docs and code

**Output:** A delta — what changed since last session, what is newly broken, what is newly resolved.

**Conflict Resolution Procedure:** When two memory files disagree (e.g., `memory_system.json` says a feature exists but `memory_bugs.json` says it's broken, or `memory_tasks.json` says a task is READY but `memory_product.json` implies its dependency is incomplete):
1. Read the actual source code or config file that is the ground truth
2. Determine which memory file reflects reality
3. Update the incorrect memory file in the current STORE step
4. Note the correction in SESSION_NOTES.md: "Memory conflict resolved: [file A] was wrong, corrected to match [file B / code]"

**Staleness Rule:** If any memory file's `last_updated` date is more than 3 git commits behind `git log --oneline -1` date, treat it as POTENTIALLY_STALE. Cross-verify its claims against live code before relying on it for decisions.

**Rule:** Be skeptical. Memory files can be stale. Trust `git log` and file reads over memory.

---

## STEP 3 — PRIORITIZE

**What:** Given the current state, decide what to work on and in what order.

**Decision criteria (in order):**
1. **Safety-first:** Is there an open HIGH/CRITICAL bug that could cause data loss or security breach? Fix that first.
2. **Foundation-first:** Is any Phase 1 task blocking Phase 2/3 work? Do that next.
3. **Highest impact per effort:** Among ready tasks, pick the one with the best impact/complexity ratio.
4. **Explicit user request:** Honor explicit requests unless they conflict with safety-first.

**Output:** A single clearly chosen task with written justification. Not a list of everything that could be done.

**Rule:** Never work on more than one task per loop cycle. Parallel work hides failures.

---

## STEP 4 — IMPLEMENT

**What:** Execute the chosen task safely.

**Operating rules:**
- Read every file before touching it
- Make the smallest change that solves the problem
- Do not refactor code outside the task scope
- Do not add features not requested
- Preserve existing working behavior
- If a change requires a migration: stage it separately, never mix schema changes with behavior changes
- If touching security-sensitive code: pause and run SECURITY REVIEW before continuing

**Specialist routing:**
- API/schema/migration work → Backend Agent role
- UI/UX/state management → Frontend Agent role
- Tests/checklists/smoke runs → QA Agent role
- Security, permissions, input validation → Security Agent role
- Deploy scripts, CI, infra → Ops Agent role

**Output:** Specific file changes with clear intent. Commit message follows `feat:|fix:|chore:|docs:` convention.

---

## STEP 5 — VALIDATE

**What:** Verify the implementation is correct before storing it as complete.

**Mandatory checks (always):**
1. Does the implementation match the task specification?
2. Does it break any currently working behavior?
3. Does it introduce any new security exposure?
4. Does `git diff` look correct and minimal?

**Test run (when tests exist):**
- Run `npm test` or relevant test suite
- All tests must pass before marking task complete

**Checklist run:**
- Apply `agentic/validation_checklist.md` to the change
- Annotate which checklist items passed, which are N/A, and which need follow-up

**Output:** A PASSED / FAILED / NEEDS-FOLLOW-UP verdict with specifics.

**Rule:** A task is NOT complete until validation passes. No exceptions.

---

## STEP 6 — STORE

**What:** Persist findings and progress so the next cycle starts with accurate state.

**Actions:**
1. Update `agentic/memory_bugs.json` — mark fixed bugs as FIXED; add newly discovered bugs
2. Update `agentic/memory_tasks.json` — mark completed tasks; update status of in-progress tasks
3. Update `agentic/memory_decisions.json` — add any new agentic decisions made this cycle
4. Update `docs/SESSION_NOTES.md` — summary of what changed (use checkpoint.ps1 if available)
5. Update `docs/DECISIONS_LOG.md` — if a product/architecture decision was made
6. Update `docs/API_CONTRACT.md` and `docs/DATA_MODEL.md` — if interfaces or schema changed
7. If `agentic/memory_system.json` maturity scores improved, update them

**Output:** All memory files reflect reality after this cycle.

**Rule:** Never skip STORE. A loop without STORE is a loop that forgets itself.

---

## STEP 7 — REPEAT

**What:** Determine what to do next.

**Actions:**
1. Re-read `agentic/memory_tasks.json` — what is the next highest-priority READY task?
2. Present a clear "next action" recommendation to the user
3. If the session is ending: write a handoff note in `docs/SESSION_NOTES.md`

**Output:** A specific next task recommendation with one-sentence justification.

---

## CYCLE TRIGGERS

The loop runs:
- At the start of every new session (SCAN always)
- After every completed task (VALIDATE → STORE → new PRIORITIZE)
- After any error or unexpected behavior (ANALYZE to diagnose before continuing)
- On explicit `checkpoint` command (STORE immediately)

---

## FAILURE MODES TO AVOID

| Failure Mode | Prevention |
|---|---|
| Implementing before scanning | SCAN is mandatory step 1 |
| Working from memory without verifying | ANALYZE cross-checks memory vs. code reality |
| Doing too many things at once | PRIORITIZE picks exactly one task |
| Shipping without testing | VALIDATE is mandatory before STORE |
| Forgetting what was done | STORE updates all memory files |
| Stale memory misleading next cycle | ANALYZE flags memory/code discrepancies |
| Scope creep during implementation | IMPLEMENT rules prohibit unrequested changes |
