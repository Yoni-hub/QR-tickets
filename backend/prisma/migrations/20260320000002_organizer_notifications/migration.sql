-- AlterTable
ALTER TABLE "UserEvent" ADD COLUMN "organizerEmail" TEXT,
ADD COLUMN "notifyOnRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notifyOnMessage" BOOLEAN NOT NULL DEFAULT false;
