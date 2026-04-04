-- AddColumn scannerLocked to UserEvent
ALTER TABLE "UserEvent" ADD COLUMN IF NOT EXISTS "scannerLocked" BOOLEAN NOT NULL DEFAULT false;
