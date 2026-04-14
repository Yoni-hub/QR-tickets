const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const { prepareTestDatabase, resetTicketRequestTestData } = require("./helpers/testDb");

const TEST_SCHEMA = process.env.TEST_DB_SCHEMA || "integration_request_approval_tests";
const testDatabaseUrl = prepareTestDatabase(TEST_SCHEMA);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.SENTRY_DSN = "";
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const { app } = require("../index");
const prisma = require("../utils/prisma");

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createEvent({
  slug = uniqueId("event").toLowerCase(),
  accessCode = uniqueId("ac").toUpperCase(),
  organizerAccessCode = uniqueId("org").toUpperCase(),
  ticketType = "General",
  ticketPrice = 0,
} = {}) {
  return prisma.userEvent.create({
    data: {
      organizerName: "Organizer Test",
      eventName: "Request Approval Test Event",
      eventDate: new Date("2099-08-15T19:00:00.000Z"),
      eventAddress: "Integration Test Venue",
      quantity: 100,
      slug,
      accessCode,
      organizerAccessCode,
      ticketType,
      ticketPrice,
      adminStatus: "ACTIVE",
      autoApprove: false,
      designJson: {
        currency: "$",
        ticketGroups: [
          {
            ticketType,
            quantity: 100,
            ticketPrice,
          },
        ],
      },
    },
  });
}

async function createVerifiedOtpToken({ email, eventSlug, token = crypto.randomBytes(16).toString("hex") }) {
  const record = await prisma.emailVerification.create({
    data: {
      email,
      eventSlug,
      code: "123456",
      verified: true,
      token,
      tokenUsed: false,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return record.token;
}

async function createTicketRequestViaPublicRoute({
  event,
  email = "buyer@example.com",
  quantity = 2,
}) {
  const otpToken = await createVerifiedOtpToken({ email, eventSlug: event.slug });
  const response = await request(app).post("/api/public/ticket-request").send({
    eventSlug: event.slug,
    name: "Buyer One",
    email,
    otpToken,
    ticketSelections: [{ ticketType: "General", quantity }],
  });
  return { response, otpToken };
}

before(async () => {
  await resetTicketRequestTestData(prisma);
});

after(async () => {
  await resetTicketRequestTestData(prisma);
  await prisma.$disconnect();
});

test("creates a valid public ticket request in PENDING_VERIFICATION state", async () => {
  const code = uniqueId("REQCREATE").toUpperCase();
  const event = await createEvent({
    accessCode: code,
    organizerAccessCode: `${code}ORG`,
    slug: uniqueId("req-create").toLowerCase(),
  });
  const { response, otpToken } = await createTicketRequestViaPublicRoute({ event, email: "valid-create@example.com", quantity: 3 });

  assert.equal(response.status, 201);
  assert.equal(response.body.request.status, "PENDING_VERIFICATION");
  assert.equal(response.body.request.quantity, 3);

  const persistedRequest = await prisma.ticketRequest.findUnique({ where: { id: response.body.request.id } });
  assert.ok(persistedRequest);
  assert.equal(persistedRequest.status, "PENDING_VERIFICATION");
  assert.equal(Number(persistedRequest.quantity), 3);

  const otpRecord = await prisma.emailVerification.findUnique({ where: { token: otpToken } });
  assert.ok(otpRecord);
  assert.equal(otpRecord.tokenUsed, true);
});

test("rejects public ticket request when OTP token is invalid", async () => {
  const code = uniqueId("REQINVALID").toUpperCase();
  const event = await createEvent({
    accessCode: code,
    organizerAccessCode: `${code}ORG`,
    slug: uniqueId("req-invalid").toLowerCase(),
  });

  const response = await request(app).post("/api/public/ticket-request").send({
    eventSlug: event.slug,
    name: "Buyer Invalid",
    email: "invalid-token@example.com",
    otpToken: "bad-token",
    ticketSelections: [{ ticketType: "General", quantity: 1 }],
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error || "", /Invalid or expired verification token/i);

  const createdRequests = await prisma.ticketRequest.findMany({ where: { eventId: event.id } });
  assert.equal(createdRequests.length, 0);
});

test("approves a pending request and issues tickets", async () => {
  const code = uniqueId("REQAPPROVE").toUpperCase();
  const event = await createEvent({
    accessCode: code,
    organizerAccessCode: `${code}ORG`,
    slug: uniqueId("req-approve").toLowerCase(),
  });
  const { response } = await createTicketRequestViaPublicRoute({ event, email: "approve@example.com", quantity: 2 });
  const requestId = response.body.request.id;

  const approveResponse = await request(app).post(`/api/ticket-requests/${requestId}/approve`).send({
    accessCode: event.accessCode,
    eventId: event.id,
  });

  assert.equal(approveResponse.status, 200);
  assert.equal(approveResponse.body.request.status, "APPROVED");
  assert.equal(approveResponse.body.generatedTickets.length, 2);

  const persistedRequest = await prisma.ticketRequest.findUnique({ where: { id: requestId } });
  assert.equal(persistedRequest.status, "APPROVED");

  const issuedTickets = await prisma.ticket.findMany({ where: { ticketRequestId: requestId }, orderBy: { createdAt: "asc" } });
  assert.equal(issuedTickets.length, 2);
  for (const ticket of issuedTickets) {
    assert.equal(ticket.status, "UNUSED");
    assert.equal(ticket.eventId, event.id);
  }
});

test("rejects a pending request and updates status to REJECTED", async () => {
  const code = uniqueId("REQREJECT").toUpperCase();
  const event = await createEvent({
    accessCode: code,
    organizerAccessCode: `${code}ORG`,
    slug: uniqueId("req-reject").toLowerCase(),
  });
  const { response } = await createTicketRequestViaPublicRoute({ event, email: "reject@example.com", quantity: 1 });
  const requestId = response.body.request.id;

  const rejectResponse = await request(app).post(`/api/ticket-requests/${requestId}/reject`).send({
    accessCode: event.accessCode,
    eventId: event.id,
  });

  assert.equal(rejectResponse.status, 200);
  assert.equal(rejectResponse.body.request.status, "REJECTED");

  const persistedRequest = await prisma.ticketRequest.findUnique({ where: { id: requestId } });
  assert.equal(persistedRequest.status, "REJECTED");
});

test("prevents approving an already rejected request", async () => {
  const code = uniqueId("REQREJECTA").toUpperCase();
  const event = await createEvent({
    accessCode: code,
    organizerAccessCode: `${code}ORG`,
    slug: uniqueId("req-reject").toLowerCase(),
  });
  const { response } = await createTicketRequestViaPublicRoute({ event, email: "reject-then-approve@example.com", quantity: 2 });
  const requestId = response.body.request.id;

  const rejectResponse = await request(app).post(`/api/ticket-requests/${requestId}/reject`).send({
    accessCode: event.accessCode,
    eventId: event.id,
  });
  assert.equal(rejectResponse.status, 200);

  const approveAfterReject = await request(app).post(`/api/ticket-requests/${requestId}/approve`).send({
    accessCode: event.accessCode,
    eventId: event.id,
  });
  assert.equal(approveAfterReject.status, 400);
  assert.match(approveAfterReject.body.error || "", /Rejected request cannot be approved/i);

  const issuedTickets = await prisma.ticket.findMany({ where: { ticketRequestId: requestId } });
  assert.equal(issuedTickets.length, 0);
});

test("blocks approving a request after the event end time", async () => {
  const code = uniqueId("REQEND").toUpperCase();
  const event = await createEvent({
    accessCode: code,
    organizerAccessCode: `${code}ORG`,
    slug: uniqueId("req-end").toLowerCase(),
  });
  const { response } = await createTicketRequestViaPublicRoute({ event, email: "after-end@example.com", quantity: 1 });
  const requestId = response.body.request.id;

  await prisma.userEvent.update({
    where: { id: event.id },
    data: { eventEndDate: new Date(Date.now() - 60 * 1000) },
  });

  const approveResponse = await request(app).post(`/api/ticket-requests/${requestId}/approve`).send({
    accessCode: event.accessCode,
    eventId: event.id,
  });

  assert.equal(approveResponse.status, 403);
  assert.match(approveResponse.body.error || "", /event has ended/i);

  const issuedTickets = await prisma.ticket.findMany({ where: { ticketRequestId: requestId } });
  assert.equal(issuedTickets.length, 0);
});
