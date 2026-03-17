DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'TicketRequestStatus'
      AND e.enumlabel = 'PENDING_PAYMENT'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'TicketRequestStatus'
      AND e.enumlabel = 'PENDING_VERIFICATION'
  ) THEN
    ALTER TYPE "public"."TicketRequestStatus" RENAME VALUE 'PENDING_PAYMENT' TO 'PENDING_VERIFICATION';
  END IF;
END
$$;

ALTER TABLE "public"."TicketRequest"
ALTER COLUMN "status" SET DEFAULT 'PENDING_VERIFICATION';
