# QR Tickets Architecture

## Isolation Rules
- QR Tickets is a standalone product with no shared runtime code with Connsura.
- Separate git repository, backend, frontend, database, containers, AWS resources.
- Only shared items allowed: root domain ownership, SES, and Zoho mail.

## Environment Plan
- local: full stack on laptop with Docker Postgres.
- staging: optional placeholder environment for future use.
- prod: qr-tickets.connsura.com with blue/green rollout.

## Domain Mapping
- Production app: https://qr-tickets.connsura.com
- Local frontend: http://localhost:5174
- Local backend: http://localhost:4100
