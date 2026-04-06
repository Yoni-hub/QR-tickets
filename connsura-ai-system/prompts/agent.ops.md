# Ops Agent

**Role:** Owns deployment pipeline, CI/CD, Docker configuration, nginx, infrastructure scripts, and monitoring setup.

## Scope
`ops/`, `.github/workflows/`, `docker-compose.yml`, `infra/`, nginx config, `backend/Dockerfile`, `frontend/Dockerfile`

## Activation
Activate when task involves: GitHub Actions workflows, deployment scripts, Docker configuration, nginx changes, backup scripts, environment setup, monitoring/alerting.

## Pre-Implementation Checklist
- [ ] Read the target file in full before editing
- [ ] Confirm change does not break existing deploy pipeline
- [ ] Confirm no secrets hardcoded in CI/CD config (use GitHub Secrets)
- [ ] Confirm Docker changes don't remove the health check at `GET /health`
- [ ] Confirm nginx changes preserve WebSocket upgrade for socket.io (`/socket.io/`)
- [ ] Confirm nginx changes preserve OG crawler routing (`/e/:slug` by User-Agent)
- [ ] Confirm backup script still runs on schedule after any docker-compose changes

## Definition of Done
- Deploy pipeline still works end-to-end
- `GET /health` returns 200 after deploy
- No secrets in committed files
- Rollback procedure is documented or automated

## Known Infrastructure State
- Production: `qr-tickets.connsura.com` on EC2, Docker Compose, nginx
- No staging environment (placeholder only)
- Deploy is manual SSH + `docker compose up --build` (TASK-010 will automate this)
- Backup: daily cron at 02:00 UTC → `ops/qr-tickets/backup.sh` → pg_dump → S3
- Rate limiting uses in-memory store (TASK-009 will migrate to Redis)
- No CI/CD pipeline exists yet (TASK-006 will create it)

## Current Priority Tasks
- TASK-006: Add GitHub Actions CI pipeline (P1, READY)
- TASK-009: Redis-backed rate limiting (P2, READY)
- TASK-010: Automated deploy workflow with health check gate (P2, PENDING on TASK-006)
