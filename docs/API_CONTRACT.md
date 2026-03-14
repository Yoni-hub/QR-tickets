# API Contract

## Event APIs
- `POST /api/events`
- `POST /api/demo/events`
- `GET /api/events/by-code/:accessCode`
- `POST /api/events/by-code/:accessCode/create-new` (create another event under an existing organizer access code)
- `PATCH /api/events/:eventId` (inline update, requires `accessCode` in body)
- `POST /api/events/by-code/:accessCode/generate-tickets` (generate tickets for existing event/access code)
- `GET /api/events/by-code/:accessCode/ticket-requests`
- `GET /api/events/by-code/:accessCode/promoters`
- `POST /api/events/by-code/:accessCode/guests`
- `POST /api/events/by-code/:accessCode/guests/bulk`
- `GET /api/events/:eventId/tickets`
  - returns ticket-level fields including `ticketType` and `ticketPrice`
- `GET /api/events/:eventId/tickets.pdf`
  - optional query param: `perPage` (`1` | `2` | `3` | `4`) for PDF ticket count per page (default `2`)

## Ticket APIs
- `GET /api/tickets/:ticketPublicId`
- `GET /api/tickets/public/:ticketPublicId`

## Order APIs
- `POST /api/orders/:accessCode/send-links`

## Public Request APIs
- `GET /api/public/events/:eventSlug`
  - returns `event.ticketTypes[]` with `{ ticketType, price, ticketsRemaining }`
- `POST /api/public/ticket-request`

## Organizer Request/Promoter APIs
- `POST /api/ticket-requests/:id/approve`
- `POST /api/ticket-requests/:id/reject`
- `POST /api/tickets/:ticketPublicId/cancel`
- `POST /api/promoters`
- `PATCH /api/promoters/:id`
- `DELETE /api/promoters/:id`

Public ticket request body:
- `eventSlug: string` (required)
- `name: string` (required)
- `email: string` (required)
- `phone?: string`
- `ticketType: string` (required)
- `quantity: number` (>= 1)
- `promoterCode?: string`

Ticket request statuses:
- `PENDING_PAYMENT`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

Send-links request body:
- `emails: string[]` (required)
- `baseUrl: string` (optional)
- `emailSubject: string` (optional, supports placeholders: `{{eventName}}`, `{{eventDate}}`, `{{eventAddress}}`, `{{ticketType}}`, `{{ticketUrl}}`, `{{recipientEmail}}`)
- `emailBody: string` (optional, same placeholders as subject)

Delivery behavior:
- `POST /api/orders/:accessCode/send-links` now resolves `{{ticketType}}` from each assigned ticket first, then falls back to event-level `ticketType`.

## Scan API
- `POST /api/scans`

Scan response results:
- `VALID`
- `USED`
- `INVALID`

Scan request supports:
- `accessCode: string` (required)
- `ticketPublicId: string` (required)
- `rawScannedValue?: string`
- `scannerSource?: string` (`manual` | `camera` | custom)

`VALID` / `USED` responses also include `ticket` summary fields when available:
- `attendeeName`
- `attendeeEmail`
- `attendeePhone`
- `quantity`
- `promoterName`

## Admin APIs (Protected by `x-admin-key`)
- `GET /api/admin/overview`
- `GET /api/admin/events`
- `GET /api/admin/events/:eventId`
- `GET /api/admin/tickets`
- `GET /api/admin/deliveries`
- `GET /api/admin/scans`
- `GET /api/admin/settings`
- `GET /api/admin/audit-log`
- `GET /api/admin/ticket-requests` (requires `accessCode` query/body/param)
- `POST /api/admin/ticket-requests/:id/approve` (requires `accessCode`)
- `POST /api/admin/ticket-requests/:id/reject` (requires `accessCode`)
- `GET /api/admin/promoters` (requires `accessCode`)
- `POST /api/admin/promoters` (requires `accessCode`)
- `PATCH /api/admin/promoters/:id` (requires `accessCode`)
- `DELETE /api/admin/promoters/:id` (requires `accessCode`)

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

## Checkpoint Updates

- 2026-03-09: Added chat endpoints for organizer/client request messaging, added admin client token listing endpoint, and updated public ticket request validation expectations.

- 2026-03-10: Updated scan contract and organizer access-code based scanner/event selection behavior

- 2026-03-11: Updated scan and event behavior: cross-organizer ticket scans are always INVALID without ticket details, generation is allowed after prior deliveries, and ticket delivery method mapping includes PUBLIC_EVENT_PAGE.

- 2026-03-13: Added organizer ticket cancellation API route and expanded ticket/client-dashboard payloads with cancellation metadata and message evidence fields.
