-- Add clientTokenExpiresAt to TicketRequest for 90-day sliding token expiry
ALTER TABLE "TicketRequest" ADD COLUMN "clientTokenExpiresAt" TIMESTAMP(3);
