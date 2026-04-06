DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrganizerInvoiceStatus') THEN
    BEGIN
      ALTER TYPE "OrganizerInvoiceStatus" ADD VALUE IF NOT EXISTS 'PAID';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER TYPE "OrganizerInvoiceStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

ALTER TABLE "OrganizerInvoice"
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentNote" TEXT;
