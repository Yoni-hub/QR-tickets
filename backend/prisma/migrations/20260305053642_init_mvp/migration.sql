-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('UNUSED', 'USED');

-- CreateEnum
CREATE TYPE "public"."ScanResult" AS ENUM ('VALID', 'USED', 'INVALID');

-- CreateTable
CREATE TABLE "public"."UserEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "eventAddress" TEXT NOT NULL,
    "ticketType" TEXT,
    "ticketPrice" DECIMAL(10,2),
    "quantity" INTEGER NOT NULL,
    "accessCode" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Ticket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketPublicId" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "status" "public"."TicketStatus" NOT NULL DEFAULT 'UNUSED',
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScanRecord" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT,
    "ticketPublicId" TEXT NOT NULL,
    "result" "public"."ScanResult" NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserEvent_accessCode_key" ON "public"."UserEvent"("accessCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketPublicId_key" ON "public"."Ticket"("ticketPublicId");

-- CreateIndex
CREATE INDEX "Ticket_eventId_idx" ON "public"."Ticket"("eventId");

-- CreateIndex
CREATE INDEX "ScanRecord_eventId_idx" ON "public"."ScanRecord"("eventId");

-- CreateIndex
CREATE INDEX "ScanRecord_ticketPublicId_idx" ON "public"."ScanRecord"("ticketPublicId");

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."UserEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScanRecord" ADD CONSTRAINT "ScanRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."UserEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScanRecord" ADD CONSTRAINT "ScanRecord_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
