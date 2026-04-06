const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { prepareTestDatabase, resetScanTestData } = require("./helpers/testDb");

const TEST_SCHEMA = process.env.TEST_DB_SCHEMA || "integration_scan_tests";
const testDatabaseUrl = prepareTestDatabase(TEST_SCHEMA);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.SENTRY_DSN = "";

const { app } = require("../index");
const prisma = require("../utils/prisma");

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function createEvent({
  eventName = "Scan Test Event",
  organizerAccessCode = "ORGSCAN01",
  accessCode = uniqueId("EVT"),
  scannerLocked = false,
  adminStatus = "ACTIVE",
} = {}) {
  return prisma.userEvent.create({
    data: {
      organizerName: "Test Organizer",
      eventName,
      eventDate: new Date("2099-06-01T20:00:00.000Z"),
      eventAddress: "Test Address",
      quantity: 100,
      accessCode,
      organizerAccessCode,
      scannerLocked,
      adminStatus,
    },
  });
}

async function createTicket({
  eventId,
  ticketPublicId = uniqueId("TKT"),
  status = "UNUSED",
  isInvalidated = false,
  scannedAt = null,
} = {}) {
  return prisma.ticket.create({
    data: {
      eventId,
      ticketPublicId,
      qrPayload: `https://example.com/t/${ticketPublicId}`,
      status,
      isInvalidated,
      scannedAt,
    },
  });
}

before(async () => {
  await resetScanTestData(prisma);
});

after(async () => {
  await resetScanTestData(prisma);
  await prisma.$disconnect();
});

test("accepts a valid first scan and marks ticket as USED", async () => {
  const code = uniqueId("ORGVALID");
  const event = await createEvent({ organizerAccessCode: code, accessCode: code });
  const ticket = await createTicket({ eventId: event.id, ticketPublicId: uniqueId("SCAN-VALID") });

  const res = await request(app).post("/api/scans").send({
    organizerAccessCode: code,
    eventId: event.id,
    ticketPublicId: ticket.ticketPublicId,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.result, "VALID");
  assert.equal(res.body.ticket.ticketPublicId, ticket.ticketPublicId);

  const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  assert.equal(updatedTicket.status, "USED");
  assert.ok(updatedTicket.scannedAt);

  const records = await prisma.scanRecord.findMany({ where: { ticketPublicId: ticket.ticketPublicId } });
  assert.equal(records.length, 1);
  assert.equal(records[0].result, "VALID");
});

test("returns ALREADY_USED for duplicate scan of used ticket", async () => {
  const code = uniqueId("ORGUSED");
  const event = await createEvent({ organizerAccessCode: code, accessCode: code });
  const ticket = await createTicket({
    eventId: event.id,
    ticketPublicId: uniqueId("SCAN-USED"),
    status: "USED",
    scannedAt: new Date("2099-06-01T20:10:00.000Z"),
  });

  const res = await request(app).post("/api/scans").send({
    organizerAccessCode: code,
    eventId: event.id,
    ticketPublicId: ticket.ticketPublicId,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.result, "ALREADY_USED");

  const records = await prisma.scanRecord.findMany({ where: { ticketPublicId: ticket.ticketPublicId } });
  assert.equal(records.length, 1);
  assert.equal(records[0].result, "USED");
});

test("returns INVALID_TICKET for unknown ticket id", async () => {
  const code = uniqueId("ORGINVALID");
  const missingTicketId = uniqueId("DOES-NOT-EXIST");
  const event = await createEvent({ organizerAccessCode: code, accessCode: code });

  const res = await request(app).post("/api/scans").send({
    organizerAccessCode: code,
    eventId: event.id,
    ticketPublicId: missingTicketId,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.result, "INVALID_TICKET");

  const records = await prisma.scanRecord.findMany({ where: { ticketPublicId: missingTicketId } });
  assert.equal(records.length, 0);
});

test("returns WRONG_EVENT when ticket belongs to another event in same organizer scope", async () => {
  const organizerAccessCode = uniqueId("ORGWRONG");
  const selectedEvent = await createEvent({
    organizerAccessCode,
    accessCode: organizerAccessCode,
    eventName: "Selected Event",
  });
  const otherEvent = await createEvent({
    organizerAccessCode,
    accessCode: uniqueId("EVT-OTHER"),
    eventName: "Other Event",
  });
  const ticket = await createTicket({ eventId: otherEvent.id, ticketPublicId: uniqueId("SCAN-WRONG-EVENT") });

  const res = await request(app).post("/api/scans").send({
    organizerAccessCode,
    eventId: selectedEvent.id,
    ticketPublicId: ticket.ticketPublicId,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.result, "WRONG_EVENT");
  assert.equal(res.body.ticket.eventId, otherEvent.id);

  const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  assert.equal(updatedTicket.status, "UNUSED");
});

test("returns BLOCKED when scanner is locked by admin", async () => {
  const code = uniqueId("ORGBLOCK");
  const blockedTicketId = uniqueId("LOCKED-SCAN");
  const event = await createEvent({
    organizerAccessCode: code,
    accessCode: code,
    scannerLocked: true,
  });

  const res = await request(app).post("/api/scans").send({
    organizerAccessCode: code,
    eventId: event.id,
    ticketPublicId: blockedTicketId,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.result, "BLOCKED");

  const records = await prisma.scanRecord.findMany({ where: { ticketPublicId: blockedTicketId } });
  assert.equal(records.length, 1);
  assert.equal(records[0].result, "INVALID");
  assert.match(records[0].note || "", /OUTCOME:BLOCKED/);
});
