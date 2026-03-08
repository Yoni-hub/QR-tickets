CREATE TYPE "public"."EventAdminStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ARCHIVED');

ALTER TABLE "public"."UserEvent"
ADD COLUMN "adminStatus" "public"."EventAdminStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "adminDisabledAt" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "public"."Ticket"
ADD COLUMN "isInvalidated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "invalidatedAt" TIMESTAMP(3);

ALTER TABLE "public"."ScanRecord"
ADD COLUMN "rawScannedValue" TEXT,
ADD COLUMN "normalizedTicketPublicId" TEXT,
ADD COLUMN "scannerSource" TEXT,
ADD COLUMN "note" TEXT;

CREATE TABLE "public"."TicketViewLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "source" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketViewLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AdminAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketViewLog_ticketId_idx" ON "public"."TicketViewLog"("ticketId");
CREATE INDEX "TicketViewLog_openedAt_idx" ON "public"."TicketViewLog"("openedAt");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "public"."AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "public"."AdminAuditLog"("targetType", "targetId");
CREATE INDEX "AdminAuditLog_eventId_idx" ON "public"."AdminAuditLog"("eventId");

ALTER TABLE "public"."TicketViewLog" ADD CONSTRAINT "TicketViewLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."UserEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;