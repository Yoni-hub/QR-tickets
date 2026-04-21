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
- `status`: `PENDING_VERIFICATION` | `APPROVED` | `REJECTED` | `CANCELLED`
- `CANCELLED` is used when organizer cancels the request/ticket flow and cancellation metadata is captured.
- approved requests generate tickets linked by `ticketRequestId`

## TicketViewLog
- logs public ticket page opens
- fields: `ticketId`, `source`, `userAgent`, `ipAddress`, `openedAt`

## AdminAuditLog
- internal audit log for admin actions
- fields: `action`, `targetType`, `targetId`, `eventId`, `metadata`, `createdAt`

## SocialIntegration
- stores server-side credentials for admin-only third-party integrations (starting with TikTok)
- `provider`: `TIKTOK`
- encrypted tokens: `accessTokenEnc`, `refreshTokenEnc?` (encrypted at rest using `TOKEN_ENCRYPTION_KEY`)
- token metadata: `accessTokenExpiresAt?`, `refreshTokenExpiresAt?`
- account metadata: `openId?`, `displayName?`
- timestamps: `connectedAt?`, `createdAt`, `updatedAt`

## OAuthState
- one-time OAuth state records used to validate admin OAuth callbacks (CSRF protection)
- fields: `provider`, `stateHash` (stored hashed), `expiresAt`, `consumedAt?`, `createdAt`

## PromoDraft
- daily admin-reviewed promo content drafts (script/caption/voiceover) per platform
- fields: `platform` (`TIKTOK`), `scheduledFor`, `status`, `scriptText`, `onScreenText?`, `captionText?`, `voiceoverText?`, `audioStorageKey?`, `videoStorageKey?`, `lastError?`, `createdAt`, `updatedAt`

## Unified Chat (Pairwise Only)

## ChatConversation
- strict pairwise conversation record (exactly 2 participants)
- `conversationType`: `ORGANIZER_ADMIN` | `ORGANIZER_CLIENT` | `ADMIN_CLIENT`
- `status`: `OPEN` | `CLOSED`
- context fields: `eventId?`, `ticketRequestId?`, `subject?`, `legacySupportConversationToken?`
- party A fields: `partyAType`, `partyAOrganizerAccessCode?`, `partyAClientAccessToken?`, `partyAReadAt?`
- party B fields: `partyBType`, `partyBOrganizerAccessCode?`, `partyBClientAccessToken?`, `partyBReadAt?`
- timestamps: `lastMessageAt`, `createdAt`, `updatedAt`
- constraint intent: no 3-party threads; only allowed pair types above

## ChatMessage
- belongs to `ChatConversation`
- sender identity fields: `senderType`, `senderOrganizerAccessCode?`, `senderClientAccessToken?`
- content fields: `body`, `messageType` (`TEXT` | `TEXT_WITH_ATTACHMENT` | `ATTACHMENT_ONLY`)
- timestamp: `createdAt`

## ChatAttachment
- belongs to `ChatMessage`
- supports `kind`: `IMAGE` | `PDF`
- supports `storageType`: `LOCAL_FILE` | `LEGACY_DATA_URL`
- fields: `mimeType`, `originalName`, `storageKey?`, `legacyDataUrl?`, `sizeBytes`, `createdAt`
- local-file attachments are private and served through authorization-checked chat attachment endpoints

## Legacy Chat Tables (Transition)
- `SupportConversation` / `SupportMessage` and `TicketRequestMessage` remain as legacy migration sources/compatibility records during cutover.
- New chat reads/writes are routed through unified chat tables and service.

## Checkpoint Updates

- 2026-03-09: Added TicketRequest.organizerMessage and new TicketRequestMessage model with sender/read tracking for chat.

- 2026-03-10: Added/used organizerAccessCode for organizer-scoped event grouping and code handling

- 2026-03-13: Added UserEvent.organizerName field for organizer-facing event details.

- 2026-03-13: Added ticket/request cancellation fields, request CANCELLED status, and evidenceImageDataUrl on ticket request messages.

- 2026-03-15: Added SupportConversation and SupportMessage models with status/sender enums and migration for support chat persistence.

- 2026-03-17: TicketRequestStatus enum/default renamed from PENDING_PAYMENT to PENDING_VERIFICATION.

- 2026-03-17: Added unified pairwise chat models (`ChatConversation`, `ChatMessage`, `ChatAttachment`) with explicit read markers and private attachment metadata.

- 2026-03-17: Added ChatConversation/ChatMessage/ChatAttachment pairwise chat models with read markers and attachment storage metadata; kept legacy chat tables for migration compatibility.
