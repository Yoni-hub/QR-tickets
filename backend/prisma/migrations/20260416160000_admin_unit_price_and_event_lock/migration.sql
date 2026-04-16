-- Add admin-configurable per-currency organizer invoice unit price
ALTER TABLE "AdminCurrencyPaymentInstruction"
ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(10, 2);

-- Lock the per-ticket unit price per event once resolved
ALTER TABLE "UserEvent"
ADD COLUMN IF NOT EXISTS "billingUnitPriceSnapshot" DECIMAL(10, 2);

-- Backfill existing admin instruction rows with current defaults when missing.
UPDATE "AdminCurrencyPaymentInstruction"
SET "unitPrice" = 5.00
WHERE "currency" = 'ETB' AND "unitPrice" IS NULL;

UPDATE "AdminCurrencyPaymentInstruction"
SET "unitPrice" = 0.99
WHERE "currency" = 'USD' AND "unitPrice" IS NULL;

UPDATE "AdminCurrencyPaymentInstruction"
SET "unitPrice" = 0.99
WHERE "currency" = 'EUR' AND "unitPrice" IS NULL;

