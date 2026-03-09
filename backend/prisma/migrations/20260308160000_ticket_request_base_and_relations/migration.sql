-- Reconcile missing core tables/columns before ticket-request extension migrations.
-- Uses IF NOT EXISTS guards so it is safe across partially-migrated environments.

DO $$
BEGIN
  CREATE TYPE "public"."TicketRequestStatus" AS ENUM ('PENDING_PAYMENT', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."UserEvent"
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentInstructions" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "UserEvent_slug_key" ON "public"."UserEvent"("slug");

CREATE TABLE IF NOT EXISTS "public"."Promoter" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promoter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Promoter_eventId_code_key" ON "public"."Promoter"("eventId", "code");
CREATE INDEX IF NOT EXISTS "Promoter_eventId_idx" ON "public"."Promoter"("eventId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Promoter_eventId_fkey'
  ) THEN
    ALTER TABLE "public"."Promoter"
      ADD CONSTRAINT "Promoter_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "public"."UserEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."TicketRequest" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "quantity" INTEGER NOT NULL,
  "promoterId" TEXT,
  "status" "public"."TicketRequestStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TicketRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TicketRequest_eventId_idx" ON "public"."TicketRequest"("eventId");
CREATE INDEX IF NOT EXISTS "TicketRequest_promoterId_idx" ON "public"."TicketRequest"("promoterId");
CREATE INDEX IF NOT EXISTS "TicketRequest_status_idx" ON "public"."TicketRequest"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TicketRequest_eventId_fkey'
  ) THEN
    ALTER TABLE "public"."TicketRequest"
      ADD CONSTRAINT "TicketRequest_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "public"."UserEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TicketRequest_promoterId_fkey'
  ) THEN
    ALTER TABLE "public"."TicketRequest"
      ADD CONSTRAINT "TicketRequest_promoterId_fkey"
      FOREIGN KEY ("promoterId") REFERENCES "public"."Promoter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "public"."Ticket"
  ADD COLUMN IF NOT EXISTS "attendeeName" TEXT,
  ADD COLUMN IF NOT EXISTS "attendeePhone" TEXT,
  ADD COLUMN IF NOT EXISTS "attendeeEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "promoterId" TEXT,
  ADD COLUMN IF NOT EXISTS "ticketRequestId" TEXT;

CREATE INDEX IF NOT EXISTS "Ticket_promoterId_idx" ON "public"."Ticket"("promoterId");
CREATE INDEX IF NOT EXISTS "Ticket_ticketRequestId_idx" ON "public"."Ticket"("ticketRequestId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Ticket_promoterId_fkey'
  ) THEN
    ALTER TABLE "public"."Ticket"
      ADD CONSTRAINT "Ticket_promoterId_fkey"
      FOREIGN KEY ("promoterId") REFERENCES "public"."Promoter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Ticket_ticketRequestId_fkey'
  ) THEN
    ALTER TABLE "public"."Ticket"
      ADD CONSTRAINT "Ticket_ticketRequestId_fkey"
      FOREIGN KEY ("ticketRequestId") REFERENCES "public"."TicketRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
