# API Contract

## Event APIs
- `POST /api/events`
- `POST /api/demo/events`
- `GET /api/events/by-code/:accessCode`
- `GET /api/events/:eventId/tickets`
- `GET /api/events/:eventId/tickets.pdf`
  - optional query param: `perPage` (`1` | `2` | `3` | `4`) for PDF ticket count per page (default `2`)

## Ticket APIs
- `GET /api/tickets/:ticketPublicId`
- `GET /api/tickets/public/:ticketPublicId`

## Order APIs
- `POST /api/orders/:accessCode/send-links`

Send-links request body:
- `emails: string[]` (required)
- `baseUrl: string` (optional)
- `emailSubject: string` (optional, supports placeholders: `{{eventName}}`, `{{eventDate}}`, `{{eventAddress}}`, `{{ticketType}}`, `{{ticketUrl}}`, `{{recipientEmail}}`)
- `emailBody: string` (optional, same placeholders as subject)

## Scan API
- `POST /api/scans`

Scan response results:
- `VALID`
- `USED`
- `INVALID`
