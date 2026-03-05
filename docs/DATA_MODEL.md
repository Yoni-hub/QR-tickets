# Data Model

## UserEvent
- `accessCode` (6-char alphanumeric, unique)
- `isDemo` (boolean)
- event metadata (name/date/address/type/price/quantity)

## Ticket
- `ticketPublicId` (unique)
- `qrPayload` (always `${PUBLIC_BASE_URL}/t/${ticketPublicId}`)
- `status`: `UNUSED` | `USED`
- `scannedAt`

## ScanRecord
- `result`: `VALID` | `USED` | `INVALID`
- `scannedAt`
- `ticketPublicId`
