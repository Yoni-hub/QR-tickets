ALTER TABLE "TicketRequest"
  ADD COLUMN IF NOT EXISTS "ticketSelections" JSONB,
  ADD COLUMN IF NOT EXISTS "evidenceImageDataUrl" TEXT;
