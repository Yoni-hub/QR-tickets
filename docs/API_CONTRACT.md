# API Contract

Source of truth:
- This file is the canonical API behavior contract for routes, payloads, and response semantics.
- Prisma schema remains the source of truth for persisted enum/storage definitions.

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
- `GET /api/public/client-dashboard/:clientAccessToken`
- `GET /api/public/client-dashboard/:clientAccessToken/messages` (legacy organizer/client chat compatibility)
- `POST /api/public/client-dashboard/:clientAccessToken/messages` (legacy organizer/client chat compatibility)

## Unified Chat APIs (Pairwise Only)
Conversation pairs are strictly limited to:
- `ORGANIZER <-> ADMIN`
- `ORGANIZER <-> CLIENT`
- `ADMIN <-> CLIENT`

Organizer-scoped:
- `GET /api/events/by-code/:accessCode/chat/conversations`
- `POST /api/events/by-code/:accessCode/chat/conversations`
- `GET /api/events/by-code/:accessCode/chat/conversations/:conversationId/messages`
- `POST /api/events/by-code/:accessCode/chat/conversations/:conversationId/messages` (supports multipart attachment upload: image/pdf)
- `POST /api/events/by-code/:accessCode/chat/conversations/:conversationId/read`
- `GET /api/events/by-code/:accessCode/chat/attachments/:attachmentId`

Client-scoped:
- `GET /api/public/client-dashboard/:clientAccessToken/chat/conversations`
- `POST /api/public/client-dashboard/:clientAccessToken/chat/conversations`
- `GET /api/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/messages`
- `POST /api/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/messages` (supports multipart attachment upload: image/pdf)
- `POST /api/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/read`
- `GET /api/public/client-dashboard/:clientAccessToken/chat/attachments/:attachmentId`

Admin-scoped (`x-admin-key`):
- `GET /api/admin/chat/conversations`
- `POST /api/admin/chat/conversations`
- `GET /api/admin/chat/conversations/:conversationId/messages`
- `POST /api/admin/chat/conversations/:conversationId/messages` (supports multipart attachment upload: image/pdf)
- `POST /api/admin/chat/conversations/:conversationId/read`
- `PATCH /api/admin/chat/conversations/:conversationId/status`
- `GET /api/admin/chat/attachments/:attachmentId`

Legacy compatibility wrappers retained during transition:
- `POST /api/public/support/conversations`
- `GET /api/public/support/conversations/:conversationToken/messages`
- `POST /api/public/support/conversations/:conversationToken/messages`
- `GET /api/ticket-requests/:id/messages`
- `POST /api/ticket-requests/:id/messages`
- `GET /api/admin/support/conversations`
- `GET /api/admin/support/conversations/:id/messages`
- `POST /api/admin/support/conversations/:id/messages`
- `PATCH /api/admin/support/conversations/:id/status`

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
- `ticketSelections: { ticketType: string, quantity: number }[]` (required, at least one)
- `evidenceImageDataUrl?: string` (required when total selected price > 0)
- `promoterCode?: string`

Ticket request statuses:
- `PENDING_VERIFICATION`
- `APPROVED`
- `REJECTED`
- `CANCELLED`
  - Used when organizer cancels a public-event request/ticket flow and records cancellation metadata/message evidence.

Send-links request body:
- `emails: string[]` (required)
- `baseUrl: string` (optional)
- `emailSubject: string` (optional, supports placeholders: `{{eventName}}`, `{{eventDate}}`, `{{eventAddress}}`, `{{ticketType}}`, `{{ticketUrl}}`, `{{recipientEmail}}`)
- `emailBody: string` (optional, same placeholders as subject)

Delivery behavior:
- `POST /api/orders/:accessCode/send-links` now resolves `{{ticketType}}` from each assigned ticket first, then falls back to event-level `ticketType`.
- Ticket list APIs may expose computed delivery channel values such as `PUBLIC_EVENT_PAGE` for organizer/client UX.
- Persisted delivery records (`TicketDelivery.method`) are currently enum-backed by Prisma as `EMAIL_LINK | PDF_DOWNLOAD`.

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
- `GET /api/admin/support/conversations` (compat alias to unified admin chat inbox)
- `GET /api/admin/support/conversations/:id/messages` (compat alias)
- `POST /api/admin/support/conversations/:id/messages` (compat alias)
- `PATCH /api/admin/support/conversations/:id/status` (compat alias)

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

## Admin Integrations (Protected by `x-admin-key`)
- `GET /api/admin/tiktok/login` (starts TikTok OAuth redirect)
- `GET /api/admin/tiktok/status` (connection status + minimal account metadata)
- `POST /api/admin/tiktok/disconnect` (removes stored token)
- `GET /api/admin/tiktok/callback` (alias callback handler; primary redirect URI is `/tiktok/callback`)

TikTok redirect URI (public, handled by backend):
- `GET /tiktok/callback` (processes code/state server-side then redirects to `/admin/integrations/tiktok`)

TikTok promo drafts (admin-only):
- `GET /api/admin/tiktok/promo/latest`
- `POST /api/admin/tiktok/promo/generate-today`
- `PATCH /api/admin/tiktok/promo/:draftId`
- `POST /api/admin/tiktok/promo/:draftId/generate-onscreen` (condenses script into 4-6 short overlay lines)
- `POST /api/admin/tiktok/promo/:draftId/generate-audio`
- `GET /api/admin/tiktok/promo/:draftId/audio` (downloads generated MP3, admin-only)
- `POST /api/admin/tiktok/promo/:draftId/render-video` (renders a 20s 1080x1920 MP4, admin-only)
- `GET /api/admin/tiktok/promo/:draftId/video` (downloads rendered MP4, admin-only)
- `POST /api/admin/tiktok/promo/:draftId/upload-draft` (not implemented yet)

## Checkpoint Updates

- 2026-03-09: Added chat endpoints for organizer/client request messaging, added admin client token listing endpoint, and updated public ticket request validation expectations.

- 2026-03-10: Updated scan contract and organizer access-code based scanner/event selection behavior

- 2026-03-11: Updated scan and event behavior: cross-organizer ticket scans are always INVALID without ticket details, generation is allowed after prior deliveries, and ticket delivery method mapping includes PUBLIC_EVENT_PAGE.

- 2026-03-13: Added organizer ticket cancellation API route and expanded ticket/client-dashboard payloads with cancellation metadata and message evidence fields.

- 2026-03-15: Added support conversation APIs for public and admin flows; adjusted public ticket-request evidence requirement so free requests do not require evidence.

- 2026-03-17: Renamed ticket-request status from PENDING_PAYMENT to PENDING_VERIFICATION and updated related frontend/backend handling.

- 2026-03-17: Added unified pairwise chat system (organizer/admin/client) with private image/PDF attachments, explicit mark-read endpoints, and compatibility wrappers for legacy chat routes.

- 2026-03-17: Added unified chat endpoints for organizer/client/admin, explicit mark-read routes, private attachment routes, and compatibility wrappers for legacy support/ticket-request chat routes.
