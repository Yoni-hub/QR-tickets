const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { prepareTestDatabase, resetTicketRequestTestData } = require("./helpers/testDb");

const TEST_SCHEMA = process.env.TEST_DB_SCHEMA || "integration_ticket_cancellation_tests";
const testDatabaseUrl = prepareTestDatabase(TEST_SCHEMA);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.SENTRY_DSN = "";
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const { app } = require("../index");
const prisma = require("../utils/prisma");

const EVIDENCE_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zs7kAAAAASUVORK5CYII=";

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createEvent({
  accessCode = uniqueId("CANCELAC").toUpperCase(),
  organizerAccessCode = `${accessCode}ORG`,
  slug = uniqueId("cancel-event").toLowerCase(),
} = {}) {
  return prisma.userEvent.create({
    data: {
      organizerName: "Cancel Flow Organizer",
      eventName: "Cancellation Test Event",
      eventDate: new Date("2099-09-10T20:00:00.000Z"),
      eventAddress: "Cancellation Venue",
      quantity: 100,
      slug,
      accessCode,
      organizerAccessCode,
      adminStatus: "ACTIVE",
      autoApprove: false,
    },
  });
}

async function createTicket({
  eventId,
  ticketPublicId = uniqueId("CANCELTKT"),
  ticketRequestId = null,
} = {}) {
  return prisma.ticket.create({
    data: {
      eventId,
      ticketPublicId,
      qrPayload: `https://example.com/t/${ticketPublicId}`,
      status: "UNUSED",
      ticketRequestId,
      attendeeName: "Buyer Cancel",
      attendeeEmail: "cancel-buyer@example.com",
    },
  });
}

async function createClientProfile(email = `${uniqueId("buyer")}@example.com`) {
  return prisma.clientProfile.create({
    data: {
      email,
      clientAccessToken: uniqueId("token"),
      tokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  });
}

async function createApprovedTicketRequest({ eventId, email = `${uniqueId("req")}@example.com` } = {}) {
  const profile = await createClientProfile(email);
  return prisma.ticketRequest.create({
    data: {
      clientProfileId: profile.id,
      eventId,
      name: "Cancellation Buyer",
      email,
      emailVerified: true,
      quantity: 1,
      ticketType: "General",
      totalPrice: 20,
      status: "APPROVED",
    },
  });
}

before(async () => {
  await resetTicketRequestTestData(prisma);
});

after(async () => {
  await resetTicketRequestTestData(prisma);
  await prisma.$disconnect();
});

test("cancels a sold ticket delivered by email link", async () => {
  const event = await createEvent({ accessCode: "CANCEL-SOLD-AC", organizerAccessCode: "CANCEL-SOLD-OAC", slug: "cancel-sold-event" });
  const ticket = await createTicket({ eventId: event.id, ticketPublicId: uniqueId("SOLD-TKT") });

  await prisma.ticketDelivery.create({
    data: {
      ticketId: ticket.id,
      email: "buyer@example.com",
      method: "EMAIL_LINK",
      status: "SENT",
    },
  });

  const cancelResponse = await request(app).post(`/api/tickets/${ticket.ticketPublicId}/cancel`).send({
    accessCode: event.accessCode,
    eventId: event.id,
    reason: "EVENT_CANCELLED",
  });

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelResponse.body.ticket.isInvalidated, true);
  assert.equal(cancelResponse.body.ticket.cancellationReason, "EVENT_CANCELLED");
  assert.equal(cancelResponse.body.request, null);
  assert.equal(cancelResponse.body.message, null);

  const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  assert.equal(updatedTicket.isInvalidated, true);
  assert.ok(updatedTicket.cancelledAt);
  assert.equal(updatedTicket.cancellationReason, "EVENT_CANCELLED");
});

test("returns 404 when cancelling a nonexistent ticket", async () => {
  const event = await createEvent({ accessCode: "CANCEL-404-AC", organizerAccessCode: "CANCEL-404-OAC", slug: "cancel-404-event" });

  const cancelResponse = await request(app).post(`/api/tickets/${uniqueId("MISSING-TKT")}/cancel`).send({
    accessCode: event.accessCode,
    eventId: event.id,
    reason: "EVENT_CANCELLED",
  });

  assert.equal(cancelResponse.status, 404);
  assert.match(cancelResponse.body.error || "", /Ticket not found/i);
});

test("returns 400 when cancelling an already-cancelled ticket", async () => {
  const event = await createEvent({ accessCode: "CANCEL-DUP-AC", organizerAccessCode: "CANCEL-DUP-OAC", slug: "cancel-dup-event" });
  const ticket = await createTicket({ eventId: event.id, ticketPublicId: uniqueId("DUP-CANCEL-TKT") });

  await prisma.ticketDelivery.create({
    data: {
      ticketId: ticket.id,
      email: "buyer@example.com",
      method: "EMAIL_LINK",
      status: "SENT",
    },
  });

  const firstCancel = await request(app).post(`/api/tickets/${ticket.ticketPublicId}/cancel`).send({
    accessCode: event.accessCode,
    eventId: event.id,
    reason: "EVENT_CANCELLED",
  });
  assert.equal(firstCancel.status, 200);

  const secondCancel = await request(app).post(`/api/tickets/${ticket.ticketPublicId}/cancel`).send({
    accessCode: event.accessCode,
    eventId: event.id,
    reason: "EVENT_CANCELLED",
  });
  assert.equal(secondCancel.status, 400);
  assert.match(secondCancel.body.error || "", /already cancelled/i);
});

test("returns 400 when attempting to cancel a ticket that was never sold", async () => {
  const event = await createEvent({ accessCode: "CANCEL-UNSOLD-AC", organizerAccessCode: "CANCEL-UNSOLD-OAC", slug: "cancel-unsold-event" });
  const ticket = await createTicket({ eventId: event.id, ticketPublicId: uniqueId("UNSOLD-TKT") });

  const cancelResponse = await request(app).post(`/api/tickets/${ticket.ticketPublicId}/cancel`).send({
    accessCode: event.accessCode,
    eventId: event.id,
    reason: "EVENT_CANCELLED",
  });

  assert.equal(cancelResponse.status, 400);
  assert.match(cancelResponse.body.error || "", /Only sold tickets can be cancelled/i);

  const unchangedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  assert.equal(unchangedTicket.isInvalidated, false);
  assert.equal(unchangedTicket.cancelledAt, null);
});

test("cancels request-linked ticket, updates request to CANCELLED, and scan returns CANCELED", async () => {
  const event = await createEvent({ accessCode: "CANCEL-REQ-AC", organizerAccessCode: "CANCEL-REQ-OAC", slug: "cancel-req-event" });
  const ticketRequest = await createApprovedTicketRequest({ eventId: event.id });
  const ticket = await createTicket({
    eventId: event.id,
    ticketPublicId: uniqueId("REQ-TKT"),
    ticketRequestId: ticketRequest.id,
  });

  const cancelResponse = await request(app).post(`/api/tickets/${ticket.ticketPublicId}/cancel`).send({
    accessCode: event.accessCode,
    eventId: event.id,
    reason: "PAYMENT_REFUNDED_TO_CUSTOMER",
    evidenceImageDataUrl: EVIDENCE_IMAGE_DATA_URL,
  });

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelResponse.body.ticket.isInvalidated, true);
  assert.ok(cancelResponse.body.request);
  assert.equal(cancelResponse.body.request.status, "CANCELLED");
  assert.ok(cancelResponse.body.message);
  assert.equal(cancelResponse.body.message.senderType, "ORGANIZER");

  const updatedRequest = await prisma.ticketRequest.findUnique({ where: { id: ticketRequest.id } });
  assert.equal(updatedRequest.status, "CANCELLED");
  assert.ok(updatedRequest.cancelledAt);

  const scanResponse = await request(app).post("/api/scans").send({
    organizerAccessCode: event.accessCode,
    eventId: event.id,
    ticketPublicId: ticket.ticketPublicId,
  });
  assert.equal(scanResponse.status, 200);
  assert.equal(scanResponse.body.result, "CANCELED");
});
