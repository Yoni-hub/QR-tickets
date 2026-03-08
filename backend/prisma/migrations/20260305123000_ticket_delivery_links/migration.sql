CREATE TYPE "public"."DeliveryMethod" AS ENUM ('EMAIL_LINK');
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('SENT', 'FAILED');

CREATE TABLE "public"."TicketDelivery" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "method" "public"."DeliveryMethod" NOT NULL DEFAULT 'EMAIL_LINK',
    "status" "public"."DeliveryStatus" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketDelivery_ticketId_idx" ON "public"."TicketDelivery"("ticketId");
CREATE INDEX "TicketDelivery_sentAt_idx" ON "public"."TicketDelivery"("sentAt");

ALTER TABLE "public"."TicketDelivery"
ADD CONSTRAINT "TicketDelivery_ticketId_fkey"
FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

