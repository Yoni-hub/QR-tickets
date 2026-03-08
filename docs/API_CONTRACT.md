# API Contract

## Event APIs
- `POST /api/events`
- `POST /api/demo/events`
- `GET /api/events/by-code/:accessCode`
- `GET /api/events/by-code/:accessCode/ticket-requests`
- `GET /api/events/by-code/:accessCode/promoters`
- `POST /api/events/by-code/:accessCode/guests`
- `POST /api/events/by-code/:accessCode/guests/bulk`
- `GET /api/events/:eventId/tickets`
- `GET /api/events/:eventId/tickets.pdf`
  - optional query param: `perPage` (`1` | `2` | `3` | `4`) for PDF ticket count per page (default `2`)

## Ticket APIs
- `GET /api/tickets/:ticketPublicId`
- `GET /api/tickets/public/:ticketPublicId`

## Order APIs
- `POST /api/orders/:accessCode/send-links`

## Public Request APIs
- `GET /api/public/events/:eventSlug`
- `POST /api/public/ticket-request`

## Organizer Request/Promoter APIs
- `POST /api/ticket-requests/:id/approve`
- `POST /api/ticket-requests/:id/reject`
- `POST /api/promoters`
- `PATCH /api/promoters/:id`
- `DELETE /api/promoters/:id`

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

## Admin APIs (Protected by `x-admin-key`)
- `GET /api/admin/overview`
- `GET /api/admin/events`
- `GET /api/admin/events/:eventId`
- `GET /api/admin/tickets`
- `GET /api/admin/deliveries`
- `GET /api/admin/scans`
- `GET /api/admin/settings`
- `GET /api/admin/audit-log`

Admin action APIs:
- `PATCH /api/admin/events/:eventId/disable`
- `PATCH /api/admin/events/:eventId/enable`
- `PATCH /api/admin/events/:eventId/archive`
- `PATCH /api/admin/events/:eventId/rotate-access-code`
- `PATCH /api/admin/tickets/:ticketPublicId/invalidate`
- `PATCH /api/admin/tickets/:ticketPublicId/restore`
- `PATCH /api/admin/tickets/:ticketPublicId/reset-usage`
- `POST /api/admin/deliveries/:deliveryId/retry`
- `PATCH /api/admin/scans/:scanId/mark-suspicious`
