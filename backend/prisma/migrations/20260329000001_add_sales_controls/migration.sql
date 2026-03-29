-- Add sales controls to UserEvent
ALTER TABLE "public"."UserEvent" ADD COLUMN "salesCutoffAt" TIMESTAMP(3);
ALTER TABLE "public"."UserEvent" ADD COLUMN "salesWindowStart" TEXT;
ALTER TABLE "public"."UserEvent" ADD COLUMN "salesWindowEnd" TEXT;
