# QR Tickets

Standalone QR event ticketing app.

## Stack
- Frontend: React + Vite + Tailwind
- Backend: Express + Prisma + PostgreSQL
- Local DB: Docker Compose

## Local Run
1. docker compose -f infra/docker-compose.local.yml up -d
2. cd backend && copy .env.example .env
3. npx prisma migrate dev
4. npm run dev
5. cd ../frontend && npm run dev

## Production Target
- https://qr-tickets.connsura.com
- Blue/green deployment model

## Current App Entry
- Frontend root (`/`) redirects to the dashboard (`/dashboard`).
- Organizer onboarding and event setup run from the dashboard flow (events-first pre-load mode).

## Ticket Design Persistence
- Ticket design is edited in dashboard ticket tooling and stored on each event as `designJson`.
- PDF downloads render from stored `designJson` so re-downloads keep the original look.
