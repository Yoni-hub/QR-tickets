ALTER TABLE "TicketRequest"
  ADD COLUMN IF NOT EXISTS "clientAccessToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TicketRequest_clientAccessToken_key"
  ON "TicketRequest"("clientAccessToken");
