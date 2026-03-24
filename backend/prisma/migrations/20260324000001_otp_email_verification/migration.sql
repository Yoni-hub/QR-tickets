-- Add emailVerified and duplicateEmailWarning to TicketRequest
ALTER TABLE "TicketRequest" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketRequest" ADD COLUMN IF NOT EXISTS "duplicateEmailWarning" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable EmailVerification
CREATE TABLE IF NOT EXISTS "EmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "eventSlug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT,
    "tokenUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerification_token_key" ON "EmailVerification"("token");
CREATE INDEX IF NOT EXISTS "EmailVerification_email_eventSlug_idx" ON "EmailVerification"("email", "eventSlug");
CREATE INDEX IF NOT EXISTS "EmailVerification_token_idx" ON "EmailVerification"("token");
