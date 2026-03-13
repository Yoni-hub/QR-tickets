ALTER TYPE "public"."TicketRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "public"."Ticket"
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationOtherReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationEvidenceImageDataUrl" TEXT;

ALTER TABLE "public"."TicketRequest"
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationOtherReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationEvidenceImageDataUrl" TEXT;

ALTER TABLE "public"."TicketRequestMessage"
  ADD COLUMN IF NOT EXISTS "evidenceImageDataUrl" TEXT;
