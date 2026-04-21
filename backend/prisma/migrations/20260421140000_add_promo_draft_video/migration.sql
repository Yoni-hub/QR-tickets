-- Add PromoDraft.videoStorageKey + VIDEO_RENDERED status

ALTER TABLE "PromoDraft"
ADD COLUMN IF NOT EXISTS "videoStorageKey" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromoDraftStatus') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'PromoDraftStatus' AND e.enumlabel = 'VIDEO_RENDERED'
    ) THEN
      ALTER TYPE "PromoDraftStatus" ADD VALUE 'VIDEO_RENDERED';
    END IF;
  END IF;
END $$;

