#!/usr/bin/env bash
set -euo pipefail

echo "Starting GREEN deployment"
docker compose -f infra/docker-compose.local.yml up -d
cd backend
npm ci
npx prisma migrate deploy
npm run dev
