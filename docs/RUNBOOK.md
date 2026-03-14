# Runbook

## Local Start
1. docker compose -f infra/docker-compose.local.yml up -d
2. cd backend && copy .env.example .env
3. npx prisma migrate dev
4. npm run dev (backend)
5. cd ../frontend && npm run dev
6. Open `http://localhost:5174` (root redirects to `/dashboard`).

## Production Blue/Green
- Follow ops/deploy_blue_green.md

## Memory Checkpoint
Run this whenever you say `checkpoint`, after major change batches, before long handoffs, and at task completion:

```powershell
powershell -ExecutionPolicy Bypass -File ops/checkpoint.ps1 `
  -Summary "Implemented scanner improvement X" `
  -ApiChanged -ApiNote "Added GET /api/example" `
  -DataModelChanged -DataModelNote "Added ExampleModel.fieldY" `
  -DecisionContext "Needed stable scanner fallback parsing" `
  -Decision "Parse /t/:id URLs and raw payloads in one extractor" `
  -DecisionConsequence "Scanner accepts both URL QR content and plain IDs"
```

Notes:
- Decision fields are optional. If omitted, no decision entry is added.
- Use `-ApiChanged` and/or `-DataModelChanged` only when those interfaces changed.
