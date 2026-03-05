# Runbook

## Local Start
1. docker compose -f infra/docker-compose.local.yml up -d
2. cd backend && copy .env.example .env
3. npx prisma migrate dev
4. npm run dev (backend)
5. cd ../frontend && npm run dev

## Production Blue/Green
- Follow ops/deploy_blue_green.md
