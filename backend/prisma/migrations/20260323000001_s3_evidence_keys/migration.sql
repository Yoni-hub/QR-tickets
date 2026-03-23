-- Add S3 key fields for evidence images
ALTER TABLE "Ticket" ADD COLUMN "cancellationEvidenceS3Key" TEXT;
ALTER TABLE "TicketRequest" ADD COLUMN "evidenceS3Key" TEXT;
ALTER TABLE "TicketRequest" ADD COLUMN "cancellationEvidenceS3Key" TEXT;
