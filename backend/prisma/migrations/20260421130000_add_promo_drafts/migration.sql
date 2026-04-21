-- Add PromoDraft for daily admin-generated promo content (TikTok, etc.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromoPlatform') THEN
    CREATE TYPE "PromoPlatform" AS ENUM ('TIKTOK');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromoDraftStatus') THEN
    CREATE TYPE "PromoDraftStatus" AS ENUM ('SCRIPT_ONLY', 'READY_TO_UPLOAD', 'AUDIO_RENDERED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PromoDraft" (
  "id" TEXT NOT NULL,
  "platform" "PromoPlatform" NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "PromoDraftStatus" NOT NULL DEFAULT 'SCRIPT_ONLY',
  "scriptText" TEXT NOT NULL,
  "captionText" TEXT,
  "voiceoverText" TEXT,
  "audioStorageKey" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromoDraft_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PromoDraft_platform_scheduledFor_key'
  ) THEN
    ALTER TABLE "PromoDraft" ADD CONSTRAINT "PromoDraft_platform_scheduledFor_key" UNIQUE ("platform", "scheduledFor");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PromoDraft_platform_scheduledFor_idx" ON "PromoDraft"("platform", "scheduledFor");
CREATE INDEX IF NOT EXISTS "PromoDraft_status_updatedAt_idx" ON "PromoDraft"("status", "updatedAt");

