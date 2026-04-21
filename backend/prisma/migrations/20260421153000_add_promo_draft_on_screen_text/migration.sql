-- Add PromoDraft.onScreenText for video overlay lines

ALTER TABLE "PromoDraft"
ADD COLUMN IF NOT EXISTS "onScreenText" TEXT;

