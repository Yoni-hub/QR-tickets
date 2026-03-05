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

## Ticket Design Persistence
- Home page ticket preview now uses an editable ticket sample (in-place editing + optional header image upload).
- The selected design is stored on each event as `designJson`.
- PDF downloads render from stored `designJson` with the same HTML/CSS ticket spec used by preview, so re-downloads keep the original look.
