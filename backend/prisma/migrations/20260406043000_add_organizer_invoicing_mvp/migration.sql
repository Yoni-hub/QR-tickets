-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'SupportedCurrency'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "SupportedCurrency" AS ENUM ('ETB', 'USD', 'EUR');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrganizerInvoiceType'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "OrganizerInvoiceType" AS ENUM ('PRE_EVENT_24H');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'OrganizerInvoiceStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "OrganizerInvoiceStatus" AS ENUM ('PENDING', 'SENT', 'PARTIAL_SEND_FAILED', 'BLOCKED_MISSING_INSTRUCTION', 'FAILED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminCurrencyPaymentInstruction" (
    "id" TEXT NOT NULL,
    "currency" "SupportedCurrency" NOT NULL,
    "instructionText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminCurrencyPaymentInstruction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrganizerInvoice" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "invoiceType" "OrganizerInvoiceType" NOT NULL DEFAULT 'PRE_EVENT_24H',
    "organizerEmailSnapshot" TEXT NOT NULL,
    "currencySnapshot" "SupportedCurrency" NOT NULL,
    "approvedTicketCountSnapshot" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(10,2) NOT NULL,
    "totalAmountSnapshot" DECIMAL(12,2) NOT NULL,
    "paymentInstructionSnapshot" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "OrganizerInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "sentByEmailAt" TIMESTAMP(3),
    "sentByChatAt" TIMESTAMP(3),
    "emailError" TEXT,
    "chatError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdminCurrencyPaymentInstruction_currency_key" ON "AdminCurrencyPaymentInstruction"("currency");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerInvoice_eventId_invoiceType_key" ON "OrganizerInvoice"("eventId", "invoiceType");
CREATE INDEX IF NOT EXISTS "OrganizerInvoice_status_generatedAt_idx" ON "OrganizerInvoice"("status", "generatedAt");
CREATE INDEX IF NOT EXISTS "OrganizerInvoice_dueAt_idx" ON "OrganizerInvoice"("dueAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OrganizerInvoice_eventId_fkey'
  ) THEN
    ALTER TABLE "OrganizerInvoice"
      ADD CONSTRAINT "OrganizerInvoice_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "UserEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
