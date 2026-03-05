# Data Model

## UserEvent
- accessCode (6-char alphanumeric, unique)
- isDemo (boolean)
- event metadata

## Ticket
- ticketPublicId (unique)
- qrPayload
- status: UNUSED | USED
- scannedAt

## ScanRecord
- result: VALID | USED | INVALID
- scannedAt
- ticketPublicId
