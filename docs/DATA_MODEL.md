# Data Model

Source of truth:
- This file is the canonical persisted data/schema memory summary.
- Final authority for actual schema/enums is `backend/prisma/schema.prisma`.

## UserEvent
- `accessCode` (6-char alphanumeric, unique)
- `slug` (public event slug, unique when present)
- `isDemo` (boolean)
- `adminStatus` (`ACTIVE` | `DISABLED` | `ARCHIVED`)
- `paymentInstructions` (manual payment instructions)
- event metadata (name/date/address/type/price/quantity)
- `designJson` (ticket design snapshot)

## Ticket
- `ticketPublicId` (unique)
- `qrPayload` (always `${PUBLIC_BASE_URL}/t/${ticketPublicId}`)
- `ticketType` (per-ticket type label)
- `ticketPrice` (per-ticket price)
- `designJson` (per-ticket design snapshot; supports per-type header image/text styling)
- attendee fields: `attendeeName`, `attendeeEmail`, `attendeePhone`
- optional links: `promoterId`, `ticketRequestId`
- `status`: `UNUSED` | `USED`
- `isInvalidated` (admin invalidation flag)
- `scannedAt`

## ScanRecord
- `result`: `VALID` | `USED` | `INVALID`
- `scannedAt`
- `ticketPublicId`
- `rawScannedValue`
- `normalizedTicketPublicId`
- `scannerSource`
- `note` (optional suspicious/admin note)

## TicketDelivery
- links ticket delivery attempts to a `Ticket`
- `method`: `EMAIL_LINK` | `PDF_DOWNLOAD` (Prisma `DeliveryMethod` enum)
- `PUBLIC_EVENT_PAGE` is an API-level/computed delivery channel, not a persisted `TicketDelivery.method` enum value.
- `status`: `SENT` | `FAILED`
- `email`, `errorMessage`, `sentAt`

## Promoter
- per-event promoter entity
- fields: `eventId`, `name`, `code`
- unique constraint: (`eventId`, `code`)
- linked to `TicketRequest` and `Ticket`

## TicketRequest
- created from public event page requests
- fields: `eventId`, `name`, `phone`, `email`, `ticketType`, `ticketPrice`, `totalPrice`, `quantity`, `promoterId`
- `status`: `PENDING_PAYMENT` | `APPROVED` | `REJECTED` | `CANCELLED`
- `CANCELLED` is used when organizer cancels the request/ticket flow and cancellation metadata is captured.
- approved requests generate tickets linked by `ticketRequestId`

## TicketViewLog
- logs public ticket page opens
- fields: `ticketId`, `source`, `userAgent`, `ipAddress`, `openedAt`

## AdminAuditLog
- internal audit log for admin actions
- fields: `action`, `targetType`, `targetId`, `eventId`, `metadata`, `createdAt`

## Checkpoint Updates

- 2026-03-09: Added TicketRequest.organizerMessage and new TicketRequestMessage model with sender/read tracking for chat.

- 2026-03-10: Added/used organizerAccessCode for organizer-scoped event grouping and code handling

- 2026-03-13: Added UserEvent.organizerName field for organizer-facing event details.

- 2026-03-13: Added ticket/request cancellation fields, request CANCELLED status, and evidenceImageDataUrl on ticket request messages.

- 2026-03-15: Added SupportConversation and SupportMessage models with status/sender enums and migration for support chat persistence.
