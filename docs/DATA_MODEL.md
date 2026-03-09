# Data Model

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
- `method`: currently `EMAIL_LINK`
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
- `status`: `PENDING_PAYMENT` | `APPROVED` | `REJECTED`
- approved requests generate tickets linked by `ticketRequestId`

## TicketViewLog
- logs public ticket page opens
- fields: `ticketId`, `source`, `userAgent`, `ipAddress`, `openedAt`

## AdminAuditLog
- internal audit log for admin actions
- fields: `action`, `targetType`, `targetId`, `eventId`, `metadata`, `createdAt`

## Checkpoint Updates

- 2026-03-09: Added TicketRequest.organizerMessage and new TicketRequestMessage model with sender/read tracking for chat.
