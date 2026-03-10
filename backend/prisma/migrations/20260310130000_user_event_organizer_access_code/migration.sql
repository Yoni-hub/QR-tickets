ALTER TABLE "UserEvent"
ADD COLUMN IF NOT EXISTS "organizerAccessCode" TEXT;

UPDATE "UserEvent"
SET "organizerAccessCode" = "accessCode"
WHERE "organizerAccessCode" IS NULL;

CREATE INDEX IF NOT EXISTS "UserEvent_organizerAccessCode_idx"
ON "UserEvent"("organizerAccessCode");
