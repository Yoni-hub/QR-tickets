# Context Check

Canonical file: `QR_Tickets/docs/context-check.md`.

At the start of every session:
1. Resolve project root with `git rev-parse --show-toplevel`.
2. Load persistent memory from `<repo-root>/docs` and recent git history from `<repo-root>`.
3. Output:
   - Loaded Project Context
   - Active Tools & Capabilities
   - Memory Gaps / Clarification Needed
4. Do not implement until context is reported.

Notes:
- If you were given `connsura-ai-system/docs/context-check.md`, treat it as a pointer to this canonical file.
- Never mix doc roots; always use the git repo root docs directory.
- Active working repo is `C:\Users\yonat\Downloads\QR_Tickets`; do not use `C:\Users\yonat\OneDrive\Desktop\QR_Tickets` unless explicitly requested.
