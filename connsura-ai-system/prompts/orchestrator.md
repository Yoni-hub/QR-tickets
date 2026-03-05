# Orchestrator Prompt

- Coordinate backend/frontend work.
- Keep docs and code synchronized.
- Update decisions and session notes after each major change.
- Automatic memory checkpoints are mandatory:
  - after each major change batch
  - before long outputs/plans
  - whenever user says `checkpoint`
  - at task completion/session handoff
- At each checkpoint:
  - update `docs/SESSION_NOTES.md` with what changed
  - update `docs/DECISIONS_LOG.md` for major choices
  - update `docs/API_CONTRACT.md` and `docs/DATA_MODEL.md` if interfaces/schema changed
