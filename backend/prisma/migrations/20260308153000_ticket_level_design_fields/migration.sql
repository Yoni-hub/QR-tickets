-- Add per-ticket type/price/design fields for true multi-type rendering
ALTER TABLE "Ticket"
  ADD COLUMN IF NOT EXISTS "ticketType" TEXT,
  ADD COLUMN IF NOT EXISTS "ticketPrice" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "designJson" JSONB;
