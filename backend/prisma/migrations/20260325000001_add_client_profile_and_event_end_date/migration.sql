-- DropIndex
DROP INDEX "TicketRequest_clientAccessToken_key";

-- AlterTable
ALTER TABLE "TicketRequest" DROP COLUMN "clientAccessToken",
DROP COLUMN "clientTokenExpiresAt",
ADD COLUMN     "clientProfileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserEvent" ADD COLUMN     "eventEndDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientProfile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "clientAccessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_email_key" ON "ClientProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_clientAccessToken_key" ON "ClientProfile"("clientAccessToken");

-- CreateIndex
CREATE INDEX "TicketRequest_clientProfileId_idx" ON "TicketRequest"("clientProfileId");

-- AddForeignKey
ALTER TABLE "TicketRequest" ADD CONSTRAINT "TicketRequest_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ChatConversation_partyA_lookup_idx" RENAME TO "ChatConversation_partyAType_partyAOrganizerAccessCode_party_idx";

-- RenameIndex
ALTER INDEX "ChatConversation_partyB_lookup_idx" RENAME TO "ChatConversation_partyBType_partyBOrganizerAccessCode_party_idx";
