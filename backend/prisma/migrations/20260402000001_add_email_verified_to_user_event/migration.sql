-- AddColumn emailVerified to UserEvent
ALTER TABLE "UserEvent" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
