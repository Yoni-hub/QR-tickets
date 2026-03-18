DO $$
BEGIN
  CREATE TYPE "public"."ChatActorType" AS ENUM ('ADMIN', 'ORGANIZER', 'CLIENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."ChatConversationType" AS ENUM ('ORGANIZER_ADMIN', 'ORGANIZER_CLIENT', 'ADMIN_CLIENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."ChatConversationStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."ChatMessageType" AS ENUM ('TEXT', 'TEXT_WITH_ATTACHMENT', 'ATTACHMENT_ONLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."ChatAttachmentKind" AS ENUM ('IMAGE', 'PDF');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."ChatAttachmentStorageType" AS ENUM ('LOCAL_FILE', 'LEGACY_DATA_URL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "public"."ChatConversation" (
  "id" TEXT NOT NULL,
  "conversationType" "public"."ChatConversationType" NOT NULL,
  "status" "public"."ChatConversationStatus" NOT NULL DEFAULT 'OPEN',
  "subject" TEXT,
  "eventId" TEXT,
  "ticketRequestId" TEXT,
  "legacySupportConversationToken" TEXT,
  "partyAType" "public"."ChatActorType" NOT NULL,
  "partyAOrganizerAccessCode" TEXT,
  "partyAClientAccessToken" TEXT,
  "partyBType" "public"."ChatActorType" NOT NULL,
  "partyBOrganizerAccessCode" TEXT,
  "partyBClientAccessToken" TEXT,
  "partyAReadAt" TIMESTAMP(3),
  "partyBReadAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderType" "public"."ChatActorType" NOT NULL,
  "senderOrganizerAccessCode" TEXT,
  "senderClientAccessToken" TEXT,
  "body" TEXT NOT NULL,
  "messageType" "public"."ChatMessageType" NOT NULL DEFAULT 'TEXT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ChatAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "kind" "public"."ChatAttachmentKind" NOT NULL,
  "storageType" "public"."ChatAttachmentStorageType" NOT NULL DEFAULT 'LOCAL_FILE',
  "mimeType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT,
  "legacyDataUrl" TEXT,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatConversation_conversationType_status_lastMessageAt_idx"
ON "public"."ChatConversation"("conversationType", "status", "lastMessageAt");

CREATE INDEX IF NOT EXISTS "ChatConversation_eventId_idx"
ON "public"."ChatConversation"("eventId");

CREATE INDEX IF NOT EXISTS "ChatConversation_ticketRequestId_idx"
ON "public"."ChatConversation"("ticketRequestId");

CREATE INDEX IF NOT EXISTS "ChatConversation_partyA_lookup_idx"
ON "public"."ChatConversation"("partyAType", "partyAOrganizerAccessCode", "partyAClientAccessToken");

CREATE INDEX IF NOT EXISTS "ChatConversation_partyB_lookup_idx"
ON "public"."ChatConversation"("partyBType", "partyBOrganizerAccessCode", "partyBClientAccessToken");

CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversation_legacySupportConversationToken_key"
ON "public"."ChatConversation"("legacySupportConversationToken")
WHERE "legacySupportConversationToken" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversation_ticketRequestId_conversationType_key"
ON "public"."ChatConversation"("ticketRequestId", "conversationType")
WHERE "ticketRequestId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_idx"
ON "public"."ChatMessage"("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "ChatAttachment_messageId_idx"
ON "public"."ChatAttachment"("messageId");

CREATE INDEX IF NOT EXISTS "ChatAttachment_storageKey_idx"
ON "public"."ChatAttachment"("storageKey");

DO $$
BEGIN
  ALTER TABLE "public"."ChatConversation"
    ADD CONSTRAINT "ChatConversation_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "public"."UserEvent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  ALTER TABLE "public"."ChatConversation"
    ADD CONSTRAINT "ChatConversation_ticketRequestId_fkey"
    FOREIGN KEY ("ticketRequestId") REFERENCES "public"."TicketRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  ALTER TABLE "public"."ChatMessage"
    ADD CONSTRAINT "ChatMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  ALTER TABLE "public"."ChatAttachment"
    ADD CONSTRAINT "ChatAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "public"."ChatConversation"
  DROP CONSTRAINT IF EXISTS "ChatConversation_pairwise_participant_type_check";

ALTER TABLE "public"."ChatConversation"
  ADD CONSTRAINT "ChatConversation_pairwise_participant_type_check"
  CHECK (
    (
      "conversationType" = 'ORGANIZER_ADMIN'
      AND (("partyAType" = 'ORGANIZER' AND "partyBType" = 'ADMIN') OR ("partyAType" = 'ADMIN' AND "partyBType" = 'ORGANIZER'))
    )
    OR (
      "conversationType" = 'ORGANIZER_CLIENT'
      AND (("partyAType" = 'ORGANIZER' AND "partyBType" = 'CLIENT') OR ("partyAType" = 'CLIENT' AND "partyBType" = 'ORGANIZER'))
    )
    OR (
      "conversationType" = 'ADMIN_CLIENT'
      AND (("partyAType" = 'ADMIN' AND "partyBType" = 'CLIENT') OR ("partyAType" = 'CLIENT' AND "partyBType" = 'ADMIN'))
    )
  );

ALTER TABLE "public"."ChatConversation"
  DROP CONSTRAINT IF EXISTS "ChatConversation_partyA_identity_check";

ALTER TABLE "public"."ChatConversation"
  ADD CONSTRAINT "ChatConversation_partyA_identity_check"
  CHECK (
    (
      "partyAType" = 'ADMIN'
      AND "partyAOrganizerAccessCode" IS NULL
      AND "partyAClientAccessToken" IS NULL
    )
    OR (
      "partyAType" = 'ORGANIZER'
      AND "partyAOrganizerAccessCode" IS NOT NULL
      AND "partyAClientAccessToken" IS NULL
    )
    OR (
      "partyAType" = 'CLIENT'
      AND "partyAClientAccessToken" IS NOT NULL
      AND "partyAOrganizerAccessCode" IS NULL
    )
  );

ALTER TABLE "public"."ChatConversation"
  DROP CONSTRAINT IF EXISTS "ChatConversation_partyB_identity_check";

ALTER TABLE "public"."ChatConversation"
  ADD CONSTRAINT "ChatConversation_partyB_identity_check"
  CHECK (
    (
      "partyBType" = 'ADMIN'
      AND "partyBOrganizerAccessCode" IS NULL
      AND "partyBClientAccessToken" IS NULL
    )
    OR (
      "partyBType" = 'ORGANIZER'
      AND "partyBOrganizerAccessCode" IS NOT NULL
      AND "partyBClientAccessToken" IS NULL
    )
    OR (
      "partyBType" = 'CLIENT'
      AND "partyBClientAccessToken" IS NOT NULL
      AND "partyBOrganizerAccessCode" IS NULL
    )
  );

-- Backfill organizer<>client ticket-request conversations
INSERT INTO "public"."ChatConversation" (
  "id",
  "conversationType",
  "status",
  "subject",
  "eventId",
  "ticketRequestId",
  "partyAType",
  "partyAOrganizerAccessCode",
  "partyBType",
  "partyBClientAccessToken",
  "lastMessageAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'tr_' || tr."id",
  'ORGANIZER_CLIENT',
  'OPEN',
  'Ticket request chat',
  tr."eventId",
  tr."id",
  'ORGANIZER',
  COALESCE(ue."organizerAccessCode", ue."accessCode"),
  'CLIENT',
  COALESCE(NULLIF(tr."clientAccessToken", ''), 'legacy-request-' || tr."id"),
  COALESCE(
    (SELECT MAX(m."createdAt") FROM "public"."TicketRequestMessage" m WHERE m."ticketRequestId" = tr."id"),
    tr."updatedAt",
    tr."createdAt"
  ),
  tr."createdAt",
  COALESCE(tr."updatedAt", tr."createdAt")
FROM "public"."TicketRequest" tr
JOIN "public"."UserEvent" ue ON ue."id" = tr."eventId"
ON CONFLICT DO NOTHING;

INSERT INTO "public"."ChatMessage" (
  "id",
  "conversationId",
  "senderType",
  "senderOrganizerAccessCode",
  "senderClientAccessToken",
  "body",
  "messageType",
  "createdAt"
)
SELECT
  'trm_' || m."id",
  'tr_' || m."ticketRequestId",
  CASE WHEN m."senderType" = 'ORGANIZER' THEN 'ORGANIZER'::"public"."ChatActorType" ELSE 'CLIENT'::"public"."ChatActorType" END,
  CASE
    WHEN m."senderType" = 'ORGANIZER'
    THEN cc."partyAOrganizerAccessCode"
    ELSE NULL
  END,
  CASE
    WHEN m."senderType" = 'CLIENT'
    THEN CASE WHEN cc."partyAType" = 'CLIENT' THEN cc."partyAClientAccessToken" ELSE cc."partyBClientAccessToken" END
    ELSE NULL
  END,
  COALESCE(NULLIF(m."message", ''), '[Attachment]'),
  CASE WHEN m."evidenceImageDataUrl" IS NOT NULL THEN 'TEXT_WITH_ATTACHMENT'::"public"."ChatMessageType" ELSE 'TEXT'::"public"."ChatMessageType" END,
  m."createdAt"
FROM "public"."TicketRequestMessage" m
JOIN "public"."ChatConversation" cc ON cc."id" = 'tr_' || m."ticketRequestId"
ON CONFLICT DO NOTHING;

INSERT INTO "public"."ChatAttachment" (
  "id",
  "messageId",
  "kind",
  "storageType",
  "mimeType",
  "originalName",
  "storageKey",
  "legacyDataUrl",
  "sizeBytes",
  "createdAt"
)
SELECT
  'trma_' || m."id",
  'trm_' || m."id",
  'IMAGE',
  'LEGACY_DATA_URL',
  'image/webp',
  'legacy-image',
  NULL,
  m."evidenceImageDataUrl",
  COALESCE(length(m."evidenceImageDataUrl"), 0),
  m."createdAt"
FROM "public"."TicketRequestMessage" m
WHERE m."evidenceImageDataUrl" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill support conversations (admin<>client or admin<>organizer based on accessCode)
INSERT INTO "public"."ChatConversation" (
  "id",
  "conversationType",
  "status",
  "subject",
  "eventId",
  "legacySupportConversationToken",
  "partyAType",
  "partyAOrganizerAccessCode",
  "partyAClientAccessToken",
  "partyBType",
  "partyBOrganizerAccessCode",
  "partyBClientAccessToken",
  "lastMessageAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'sup_' || sc."id",
  CASE WHEN oe."id" IS NOT NULL THEN 'ORGANIZER_ADMIN'::"public"."ChatConversationType" ELSE 'ADMIN_CLIENT'::"public"."ChatConversationType" END,
  CASE WHEN sc."status" = 'CLOSED' THEN 'CLOSED'::"public"."ChatConversationStatus" ELSE 'OPEN'::"public"."ChatConversationStatus" END,
  'Support conversation',
  sc."eventId",
  sc."conversationToken",
  'ADMIN',
  NULL,
  NULL,
  CASE WHEN oe."id" IS NOT NULL THEN 'ORGANIZER'::"public"."ChatActorType" ELSE 'CLIENT'::"public"."ChatActorType" END,
  CASE WHEN oe."id" IS NOT NULL THEN COALESCE(oe."organizerAccessCode", oe."accessCode") ELSE NULL END,
  CASE WHEN oe."id" IS NULL THEN COALESCE(NULLIF(sc."conversationToken", ''), 'legacy-support-' || sc."id") ELSE NULL END,
  COALESCE(sc."lastMessageAt", sc."updatedAt", sc."createdAt"),
  sc."createdAt",
  sc."updatedAt"
FROM "public"."SupportConversation" sc
LEFT JOIN LATERAL (
  SELECT ue."id", ue."accessCode", ue."organizerAccessCode"
  FROM "public"."UserEvent" ue
  WHERE ue."accessCode" = sc."accessCode" OR ue."organizerAccessCode" = sc."accessCode"
  ORDER BY ue."createdAt" ASC
  LIMIT 1
) oe ON TRUE
ON CONFLICT DO NOTHING;

INSERT INTO "public"."ChatMessage" (
  "id",
  "conversationId",
  "senderType",
  "senderOrganizerAccessCode",
  "senderClientAccessToken",
  "body",
  "messageType",
  "createdAt"
)
SELECT
  'supm_' || sm."id",
  'sup_' || sm."conversationId",
  CASE
    WHEN sm."senderType" = 'ADMIN' THEN 'ADMIN'::"public"."ChatActorType"
    WHEN cc."conversationType" = 'ORGANIZER_ADMIN' THEN 'ORGANIZER'::"public"."ChatActorType"
    ELSE 'CLIENT'::"public"."ChatActorType"
  END,
  CASE
    WHEN sm."senderType" <> 'ADMIN' AND cc."conversationType" = 'ORGANIZER_ADMIN'
    THEN cc."partyBOrganizerAccessCode"
    ELSE NULL
  END,
  CASE
    WHEN sm."senderType" <> 'ADMIN' AND cc."conversationType" = 'ADMIN_CLIENT'
    THEN cc."partyBClientAccessToken"
    ELSE NULL
  END,
  COALESCE(NULLIF(sm."message", ''), '[Attachment]'),
  CASE WHEN sm."evidenceImageDataUrl" IS NOT NULL THEN 'TEXT_WITH_ATTACHMENT'::"public"."ChatMessageType" ELSE 'TEXT'::"public"."ChatMessageType" END,
  sm."createdAt"
FROM "public"."SupportMessage" sm
JOIN "public"."ChatConversation" cc ON cc."id" = 'sup_' || sm."conversationId"
ON CONFLICT DO NOTHING;

INSERT INTO "public"."ChatAttachment" (
  "id",
  "messageId",
  "kind",
  "storageType",
  "mimeType",
  "originalName",
  "storageKey",
  "legacyDataUrl",
  "sizeBytes",
  "createdAt"
)
SELECT
  'supma_' || sm."id",
  'supm_' || sm."id",
  'IMAGE',
  'LEGACY_DATA_URL',
  'image/webp',
  'legacy-image',
  NULL,
  sm."evidenceImageDataUrl",
  COALESCE(length(sm."evidenceImageDataUrl"), 0),
  sm."createdAt"
FROM "public"."SupportMessage" sm
WHERE sm."evidenceImageDataUrl" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Initialize read markers based on latest seen behavior from legacy readAt markers.
UPDATE "public"."ChatConversation" cc
SET
  "partyAReadAt" = sub."partyAReadAt",
  "partyBReadAt" = sub."partyBReadAt"
FROM (
  SELECT
    c."id",
    MAX(CASE WHEN m."senderType" <> c."partyAType" THEN COALESCE(m."createdAt", c."createdAt") ELSE NULL END) AS "partyAReadAt",
    MAX(CASE WHEN m."senderType" <> c."partyBType" THEN COALESCE(m."createdAt", c."createdAt") ELSE NULL END) AS "partyBReadAt"
  FROM "public"."ChatConversation" c
  LEFT JOIN "public"."ChatMessage" m ON m."conversationId" = c."id"
  GROUP BY c."id"
) sub
WHERE cc."id" = sub."id";