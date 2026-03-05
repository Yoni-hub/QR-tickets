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
  - run `ops/checkpoint.ps1` first
  - ensure `docs/SESSION_NOTES.md` is updated with what changed
  - ensure `docs/DECISIONS_LOG.md` is updated for major choices
  - ensure `docs/API_CONTRACT.md` and `docs/DATA_MODEL.md` are updated if interfaces/schema changed
