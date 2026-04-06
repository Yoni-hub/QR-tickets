const path = require("path");
const { execFileSync } = require("child_process");
const dotenv = require("dotenv");

const backendRoot = path.resolve(__dirname, "..", "..");
const prismaCli = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");
dotenv.config({ path: path.join(backendRoot, ".env") });

function getBaseDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!value) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL must be set to run integration tests.");
  }
  return value;
}

function buildSchemaDatabaseUrl(schemaName) {
  const baseUrl = getBaseDatabaseUrl();
  const parsed = new URL(baseUrl);
  parsed.searchParams.set("schema", schemaName);
  return parsed.toString();
}

function prepareTestDatabase(schemaName) {
  const databaseUrl = buildSchemaDatabaseUrl(schemaName);
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  return databaseUrl;
}

async function resetScanTestData(prisma) {
  await executeResetWithDeadlockRetry(prisma, 'TRUNCATE TABLE "ScanRecord", "Ticket", "TicketRequest", "Promoter", "UserEvent", "ClientProfile" RESTART IDENTITY CASCADE');
}

async function resetTicketRequestTestData(prisma) {
  await executeResetWithDeadlockRetry(prisma, 'TRUNCATE TABLE "ChatAttachment", "ChatMessage", "ChatConversation", "SupportMessage", "SupportConversation", "TicketViewLog", "TicketDelivery", "ScanRecord", "Ticket", "TicketRequestMessage", "TicketRequest", "Promoter", "EmailVerification", "ClientProfile", "AdminAuditLog", "UserEvent" RESTART IDENTITY CASCADE');
}

async function resetInvoiceTestData(prisma) {
  await executeResetWithDeadlockRetry(prisma, 'TRUNCATE TABLE "OrganizerInvoice", "AdminCurrencyPaymentInstruction", "ChatAttachment", "ChatMessage", "ChatConversation", "SupportMessage", "SupportConversation", "TicketViewLog", "TicketDelivery", "ScanRecord", "Ticket", "TicketRequestMessage", "TicketRequest", "Promoter", "EmailVerification", "ClientProfile", "AdminAuditLog", "UserEvent" RESTART IDENTITY CASCADE');
}

function isDeadlockError(error) {
  if (!error) return false;
  if (String(error.code || "") === "P2010") {
    const message = String(error.message || "");
    return message.includes("40P01") || message.toLowerCase().includes("deadlock detected");
  }
  return String(error.code || "") === "40P01";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeResetWithDeadlockRetry(prisma, sql) {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (error) {
      const retryable = isDeadlockError(error) && attempt < maxAttempts;
      if (!retryable) throw error;
      await sleep(40 * attempt);
    }
  }
}

module.exports = {
  prepareTestDatabase,
  resetScanTestData,
  resetTicketRequestTestData,
  resetInvoiceTestData,
};
