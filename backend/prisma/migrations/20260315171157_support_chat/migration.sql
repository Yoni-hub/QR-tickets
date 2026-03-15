-- CreateEnum
CREATE TYPE "public"."SupportConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."SupportMessageSender" AS ENUM ('VISITOR', 'ADMIN');

-- CreateTable
CREATE TABLE "public"."SupportConversation" (
    "id" TEXT NOT NULL,
    "conversationToken" TEXT NOT NULL,
    "eventId" TEXT,
    "displayName" TEXT,
    "email" TEXT,
    "accessCode" TEXT,
    "status" "public"."SupportConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupportMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" "public"."SupportMessageSender" NOT NULL,
    "message" TEXT NOT NULL,
    "evidenceImageDataUrl" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportConversation_conversationToken_key" ON "public"."SupportConversation"("conversationToken");

-- CreateIndex
CREATE INDEX "SupportConversation_status_lastMessageAt_idx" ON "public"."SupportConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportConversation_eventId_idx" ON "public"."SupportConversation"("eventId");

-- CreateIndex
CREATE INDEX "SupportConversation_accessCode_idx" ON "public"."SupportConversation"("accessCode");

-- CreateIndex
CREATE INDEX "SupportMessage_conversationId_createdAt_idx" ON "public"."SupportMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportMessage_conversationId_readAt_idx" ON "public"."SupportMessage"("conversationId", "readAt");

-- AddForeignKey
ALTER TABLE "public"."SupportConversation" ADD CONSTRAINT "SupportConversation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."UserEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupportMessage" ADD CONSTRAINT "SupportMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
