DO $$
BEGIN
  CREATE TYPE "TicketRequestMessageSender" AS ENUM ('ORGANIZER', 'CLIENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "TicketRequestMessage" (
  "id" TEXT NOT NULL,
  "ticketRequestId" TEXT NOT NULL,
  "senderType" "TicketRequestMessageSender" NOT NULL,
  "message" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketRequestMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TicketRequestMessage_ticketRequestId_createdAt_idx"
ON "TicketRequestMessage"("ticketRequestId", "createdAt");

CREATE INDEX IF NOT EXISTS "TicketRequestMessage_ticketRequestId_readAt_idx"
ON "TicketRequestMessage"("ticketRequestId", "readAt");

DO $$
BEGIN
  ALTER TABLE "TicketRequestMessage"
  ADD CONSTRAINT "TicketRequestMessage_ticketRequestId_fkey"
  FOREIGN KEY ("ticketRequestId") REFERENCES "TicketRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
