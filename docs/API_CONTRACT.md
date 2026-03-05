# API Contract

## Event APIs
- `POST /api/events`
- `POST /api/demo/events`
- `GET /api/events/by-code/:accessCode`
- `GET /api/events/:eventId/tickets`
- `GET /api/events/:eventId/tickets.pdf`

## Ticket APIs
- `GET /api/tickets/:ticketPublicId`

## Scan API
- `POST /api/scans`

Scan response results:
- `VALID`
- `USED`
- `INVALID`
