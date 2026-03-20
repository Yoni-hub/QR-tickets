ALTER TYPE "ChatMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM';
CREATE TYPE "ChatMessageEmailStatus" AS ENUM ('SENT', 'FAILED', 'NO_EMAIL');
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "emailStatus" "ChatMessageEmailStatus";
