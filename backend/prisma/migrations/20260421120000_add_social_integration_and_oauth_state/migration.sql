-- Add SocialIntegration + OAuthState for admin-only provider integrations (TikTok, etc.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SocialProvider') THEN
    CREATE TYPE "SocialProvider" AS ENUM ('TIKTOK');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SocialIntegration" (
  "id" TEXT NOT NULL,
  "provider" "SocialProvider" NOT NULL,
  "accessTokenEnc" TEXT NOT NULL,
  "refreshTokenEnc" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "openId" TEXT,
  "displayName" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialIntegration_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SocialIntegration_provider_key'
  ) THEN
    ALTER TABLE "SocialIntegration" ADD CONSTRAINT "SocialIntegration_provider_key" UNIQUE ("provider");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SocialIntegration_provider_idx" ON "SocialIntegration"("provider");

CREATE TABLE IF NOT EXISTS "OAuthState" (
  "id" TEXT NOT NULL,
  "provider" "SocialProvider" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OAuthState_stateHash_key'
  ) THEN
    ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_stateHash_key" UNIQUE ("stateHash");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OAuthState_provider_expiresAt_idx" ON "OAuthState"("provider", "expiresAt");
CREATE INDEX IF NOT EXISTS "OAuthState_consumedAt_idx" ON "OAuthState"("consumedAt");

