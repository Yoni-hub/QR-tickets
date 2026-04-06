DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizerInvoiceType') THEN
    BEGIN
      ALTER TYPE "OrganizerInvoiceType" ADD VALUE IF NOT EXISTS 'POST_EVENT_FINAL';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

ALTER TABLE "OrganizerInvoice"
  ADD COLUMN IF NOT EXISTS "previousInvoiceId" TEXT,
  ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "OrganizerInvoice"
SET "totalAmount" = "totalAmountSnapshot"
WHERE "totalAmount" IS NULL;

ALTER TABLE "OrganizerInvoice"
  ALTER COLUMN "totalAmount" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "OrganizerInvoice_eventId_status_idx" ON "OrganizerInvoice"("eventId", "status");
