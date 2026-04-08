-- CreateEnum
CREATE TYPE "InvoicePaymentEvidenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');

-- AlterTable
ALTER TABLE "UserEvent"
ADD COLUMN "invoiceEvidenceAutoApprove" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InvoicePaymentEvidence" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizerAccessCode" TEXT NOT NULL,
    "note" TEXT,
    "evidenceImageDataUrl" TEXT NOT NULL,
    "status" "InvoicePaymentEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePaymentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoicePaymentEvidence_invoiceId_status_submittedAt_idx" ON "InvoicePaymentEvidence"("invoiceId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "InvoicePaymentEvidence_eventId_submittedAt_idx" ON "InvoicePaymentEvidence"("eventId", "submittedAt");

-- CreateIndex
CREATE INDEX "InvoicePaymentEvidence_organizerAccessCode_status_idx" ON "InvoicePaymentEvidence"("organizerAccessCode", "status");

-- AddForeignKey
ALTER TABLE "InvoicePaymentEvidence" ADD CONSTRAINT "InvoicePaymentEvidence_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "OrganizerInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentEvidence" ADD CONSTRAINT "InvoicePaymentEvidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "UserEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
