-- Set default invoice type to POST_EVENT_FINAL for newly created invoices.
ALTER TABLE "OrganizerInvoice" ALTER COLUMN "invoiceType" SET DEFAULT 'POST_EVENT_FINAL';

