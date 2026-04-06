const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { prepareTestDatabase, resetTicketRequestTestData } = require("./helpers/testDb");

const TEST_SCHEMA = process.env.TEST_DB_SCHEMA || "integration_organizer_recovery_tests";
const testDatabaseUrl = prepareTestDatabase(TEST_SCHEMA);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.SENTRY_DSN = "";
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const { app } = require("../index");
const prisma = require("../utils/prisma");

const ORGANIZER_RECOVERY_SLUG = "__organizer_recovery__";

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createOrganizerEvent({ organizerEmail, slug = uniqueId("org-recovery-event").toLowerCase() }) {
  const accessCode = uniqueId("ORGRC").toUpperCase();
  return prisma.userEvent.create({
    data: {
      organizerName: "Organizer Recovery",
      organizerEmail,
      eventName: "Organizer Recovery Test Event",
      eventDate: new Date("2099-01-01T20:00:00.000Z"),
      eventAddress: "Recovery Test Venue",
      quantity: 100,
      slug,
      accessCode,
      organizerAccessCode: `${accessCode}ORG`,
      adminStatus: "ACTIVE",
      autoApprove: false,
    },
  });
}

function postRecover(path, body, ipOctet) {
  return request(app)
    .post(path)
    .set("X-Forwarded-For", `10.88.0.${ipOctet}`)
    .send(body);
}

before(async () => {
  await resetTicketRequestTestData(prisma);
});

after(async () => {
  await resetTicketRequestTestData(prisma);
  await prisma.$disconnect();
});

test("send organizer recovery OTP returns sent=true and creates OTP when organizer email exists", async () => {
  const email = "organizer-exists@example.com";
  await createOrganizerEvent({ organizerEmail: email });

  const response = await postRecover("/api/public/recover-organizer-code/send-otp", { email }, 11);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { sent: true });

  const record = await prisma.emailVerification.findFirst({
    where: { email, eventSlug: ORGANIZER_RECOVERY_SLUG, verified: false, tokenUsed: false },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(record);
  assert.equal(record.code.length, 6);
});

test("send organizer recovery OTP returns sent=true and does not create OTP when organizer email does not exist", async () => {
  const email = "organizer-missing@example.com";

  const response = await postRecover("/api/public/recover-organizer-code/send-otp", { email }, 12);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { sent: true });

  const record = await prisma.emailVerification.findFirst({
    where: { email, eventSlug: ORGANIZER_RECOVERY_SLUG },
  });
  assert.equal(record, null);
});

test("confirm organizer recovery OTP succeeds with valid code and marks OTP as used", async () => {
  const email = "organizer-confirm@example.com";
  await createOrganizerEvent({ organizerEmail: email });

  const sendResponse = await postRecover("/api/public/recover-organizer-code/send-otp", { email }, 13);
  assert.equal(sendResponse.status, 200);

  const otpRecord = await prisma.emailVerification.findFirst({
    where: { email, eventSlug: ORGANIZER_RECOVERY_SLUG, verified: false, tokenUsed: false },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(otpRecord);

  const confirmResponse = await postRecover("/api/public/recover-organizer-code/confirm", { email, code: otpRecord.code }, 14);
  assert.equal(confirmResponse.status, 200);
  assert.deepEqual(confirmResponse.body, { sent: true });

  const updated = await prisma.emailVerification.findUnique({ where: { id: otpRecord.id } });
  assert.equal(updated.verified, true);
  assert.equal(updated.tokenUsed, true);
});

test("confirm organizer recovery OTP rejects incorrect code and increments attempts", async () => {
  const email = "organizer-wrong-code@example.com";
  await createOrganizerEvent({ organizerEmail: email });

  const sendResponse = await postRecover("/api/public/recover-organizer-code/send-otp", { email }, 15);
  assert.equal(sendResponse.status, 200);

  const otpRecord = await prisma.emailVerification.findFirst({
    where: { email, eventSlug: ORGANIZER_RECOVERY_SLUG, verified: false, tokenUsed: false },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(otpRecord);

  const confirmResponse = await postRecover("/api/public/recover-organizer-code/confirm", { email, code: "000000" }, 16);
  assert.equal(confirmResponse.status, 400);
  assert.match(confirmResponse.body.error || "", /Incorrect code\./i);
  assert.match(confirmResponse.body.error || "", /2 attempts remaining/i);

  const updated = await prisma.emailVerification.findUnique({ where: { id: otpRecord.id } });
  assert.equal(updated.attempts, 1);
  assert.equal(updated.verified, false);
  assert.equal(updated.tokenUsed, false);
});

test("confirm organizer recovery OTP rejects when max attempts are already reached", async () => {
  const email = "organizer-max-attempts@example.com";
  await createOrganizerEvent({ organizerEmail: email });

  await prisma.emailVerification.create({
    data: {
      email,
      eventSlug: ORGANIZER_RECOVERY_SLUG,
      code: "123456",
      attempts: 3,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const response = await postRecover("/api/public/recover-organizer-code/confirm", { email, code: "123456" }, 17);

  assert.equal(response.status, 400);
  assert.match(response.body.error || "", /Too many incorrect attempts/i);
});
