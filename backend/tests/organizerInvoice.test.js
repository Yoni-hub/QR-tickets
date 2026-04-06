const { test, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const { prepareTestDatabase, resetInvoiceTestData } = require("./helpers/testDb");

const TEST_SCHEMA = process.env.TEST_DB_SCHEMA || "integration_organizer_invoice_tests";
const testDatabaseUrl = prepareTestDatabase(TEST_SCHEMA);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = "test";
process.env.SENTRY_DSN = "";
process.env.ADMIN_PANEL_KEY = "test-admin-key";
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const { app } = require("../index");
const prisma = require("../utils/prisma");
const {
  processPreEventInvoice,
  processFinalSettlementInvoice,
  markOverdueInvoices,
  markInvoicePaid,
  addInvoicePayment,
  BLOCK_NEW_EVENT_MESSAGE,
} = require("../services/organizerInvoiceService");

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createEvent({
  currencySymbol = "$",
  organizerEmail = "organizer@example.com",
  eventDate = "2099-10-20T18:00:00.000Z",
  eventEndDate = "2099-10-20T20:00:00.000Z",
  accessCode = uniqueId("ac").toUpperCase(),
  organizerAccessCode = uniqueId("org").toUpperCase(),
} = {}) {
  return prisma.userEvent.create({
    data: {
      organizerName: "Invoice Organizer",
      organizerEmail,
      eventName: `Invoice Event ${uniqueId("name")}`,
      eventDate: new Date(eventDate),
      eventEndDate: new Date(eventEndDate),
      eventAddress: "Invoice Venue",
      quantity: 100,
      slug: uniqueId("slug").toLowerCase(),
      accessCode,
      organizerAccessCode,
      ticketType: "General",
      ticketPrice: 20,
      adminStatus: "ACTIVE",
      autoApprove: false,
      isDemo: false,
      designJson: {
        currency: currencySymbol,
        ticketGroups: [{ ticketType: "General", quantity: 100, ticketPrice: 20 }],
      },
    },
  });
}

async function createApprovedTickets({ eventId, ticketCount, createdAt = null }) {
  const clientProfile = await prisma.clientProfile.create({
    data: {
      email: `${uniqueId("client")}@example.com`,
      clientAccessToken: crypto.randomBytes(16).toString("hex"),
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const ticketRequest = await prisma.ticketRequest.create({
    data: {
      clientProfileId: clientProfile.id,
      eventId,
      name: "Buyer",
      email: clientProfile.email,
      quantity: ticketCount,
      status: "APPROVED",
      ticketType: "General",
      ticketPrice: 20,
      totalPrice: 20 * ticketCount,
      ...(createdAt ? { createdAt: new Date(createdAt), updatedAt: new Date(createdAt) } : {}),
    },
  });

  for (let index = 0; index < ticketCount; index += 1) {
    await prisma.ticket.create({
      data: {
        eventId,
        ticketRequestId: ticketRequest.id,
        ticketPublicId: uniqueId("ticket").toUpperCase(),
        qrPayload: `https://example.test/t/${uniqueId("qr")}`,
        status: "UNUSED",
        ...(createdAt ? { createdAt: new Date(createdAt), updatedAt: new Date(createdAt) } : {}),
      },
    });
  }
}

async function setInstruction(currency, text) {
  await prisma.adminCurrencyPaymentInstruction.upsert({
    where: { currency },
    create: { currency, instructionText: text },
    update: { instructionText: text },
  });
}

beforeEach(async () => {
  await resetInvoiceTestData(prisma);
});

after(async () => {
  await resetInvoiceTestData(prisma);
  await prisma.$disconnect();
});

test("pre-event invoice snapshots ETB/USD/EUR pricing and instruction", async () => {
  const cases = [
    { symbol: "ETB", currency: "ETB", unitPrice: "5.00", total: "15.00" },
    { symbol: "$", currency: "USD", unitPrice: "0.99", total: "2.97" },
    { symbol: "EUR", currency: "EUR", unitPrice: "0.99", total: "2.97" },
  ];

  for (const item of cases) {
    await setInstruction(item.currency, `${item.currency} payment instruction`);
    const event = await createEvent({ currencySymbol: item.symbol });
    await createApprovedTickets({ eventId: event.id, ticketCount: 3 });
    const result = await processPreEventInvoice(event, {
      sendInvoiceEmail: async () => {},
      sendInvoiceChat: async () => {},
      now: new Date("2099-10-19T18:00:00.000Z"),
    });
    assert.equal(result.status, "SENT");

    const invoice = await prisma.organizerInvoice.findUnique({
      where: { eventId_invoiceType: { eventId: event.id, invoiceType: "PRE_EVENT_24H" } },
    });
    assert.ok(invoice);
    assert.equal(invoice.currencySnapshot, item.currency);
    assert.equal(Number(invoice.unitPriceSnapshot).toFixed(2), item.unitPrice);
    assert.equal(Number(invoice.totalAmount).toFixed(2), item.total);
    assert.equal(Number(invoice.amountPaid).toFixed(2), "0.00");
  }
});

test("CASE 1: paid early + extra tickets -> only delta billed in final invoice", async () => {
  await setInstruction("USD", "USD bank details");
  const event = await createEvent({ currencySymbol: "$" });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });
  const preInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "PRE_EVENT_24H" } },
  });
  await markInvoicePaid(preInvoice.id, { now: new Date("2099-10-19T19:00:00.000Z") });

  await createApprovedTickets({ eventId: event.id, ticketCount: 1, createdAt: "2099-10-20T19:30:00.000Z" });
  const finalResult = await processFinalSettlementInvoice(event, {
    now: new Date("2099-10-20T20:31:00.000Z"),
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
  });
  assert.equal(finalResult.status, "SENT");

  const finalInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "POST_EVENT_FINAL" } },
  });
  assert.ok(finalInvoice);
  assert.equal(Number(finalInvoice.totalAmount).toFixed(2), "0.99");
});

test("CASE 2: unpaid + extra tickets -> full remaining balance billed", async () => {
  await setInstruction("USD", "USD bank details");
  const event = await createEvent({ currencySymbol: "$" });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });
  await createApprovedTickets({ eventId: event.id, ticketCount: 1, createdAt: "2099-10-20T19:30:00.000Z" });

  const finalResult = await processFinalSettlementInvoice(event, {
    now: new Date("2099-10-20T20:31:00.000Z"),
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
  });
  assert.equal(finalResult.status, "SENT");

  const finalInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "POST_EVENT_FINAL" } },
  });
  assert.equal(Number(finalInvoice.totalAmount).toFixed(2), "2.97");
});

test("CASE 3: partial payment -> final remaining is mathematically correct", async () => {
  await setInstruction("USD", "USD bank details");
  const event = await createEvent({ currencySymbol: "$" });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });
  const preInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "PRE_EVENT_24H" } },
  });
  await markInvoicePaid(preInvoice.id, { amountPaid: 1.0, now: new Date("2099-10-19T19:00:00.000Z") });
  await createApprovedTickets({ eventId: event.id, ticketCount: 1, createdAt: "2099-10-20T19:30:00.000Z" });

  const finalResult = await processFinalSettlementInvoice(event, {
    now: new Date("2099-10-20T20:31:00.000Z"),
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
  });
  assert.equal(finalResult.status, "SENT");

  const finalInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "POST_EVENT_FINAL" } },
  });
  assert.equal(Number(finalInvoice.totalAmount).toFixed(2), "1.97");
});

test("CASE 4: no extra tickets after full payment -> no final invoice created", async () => {
  await setInstruction("USD", "USD bank details");
  const event = await createEvent({ currencySymbol: "$" });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });
  const preInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "PRE_EVENT_24H" } },
  });
  await markInvoicePaid(preInvoice.id, { now: new Date("2099-10-19T19:00:00.000Z") });

  const finalResult = await processFinalSettlementInvoice(event, {
    now: new Date("2099-10-20T20:31:00.000Z"),
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
  });
  assert.equal(finalResult.status, "NO_BALANCE_DUE");

  const finalInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "POST_EVENT_FINAL" } },
  });
  assert.equal(finalInvoice, null);
});

test("CASE 5: unpaid final invoice overdue blocks create-new event", async () => {
  await setInstruction("USD", "USD bank details");
  const organizerAccessCode = uniqueId("org").toUpperCase();
  const accessCode = uniqueId("ac").toUpperCase();
  const event = await createEvent({ currencySymbol: "$", organizerAccessCode, accessCode });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });
  await processFinalSettlementInvoice(event, {
    now: new Date("2099-10-20T20:31:00.000Z"),
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
  });
  await markOverdueInvoices({ now: new Date("2099-10-20T23:40:00.000Z") });

  const response = await request(app).post(`/api/events/by-code/${encodeURIComponent(organizerAccessCode)}/create-new`).send({
    eventName: "Blocked Event",
    eventAddress: "Blocked Venue",
    eventDate: "2099-12-01T18:00:00.000Z",
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, BLOCK_NEW_EVENT_MESSAGE);
});

test("CASE 6: paying final invoice removes block and create-new works", async () => {
  await setInstruction("USD", "USD bank details");
  const organizerAccessCode = uniqueId("org").toUpperCase();
  const accessCode = uniqueId("ac").toUpperCase();
  const event = await createEvent({ currencySymbol: "$", organizerAccessCode, accessCode });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });
  await processFinalSettlementInvoice(event, {
    now: new Date("2099-10-20T20:31:00.000Z"),
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
  });
  await markOverdueInvoices({ now: new Date("2099-10-20T23:40:00.000Z") });

  const finalInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "POST_EVENT_FINAL" } },
  });
  await markInvoicePaid(finalInvoice.id, { now: new Date("2099-10-20T23:45:00.000Z") });

  const response = await request(app).post(`/api/events/by-code/${encodeURIComponent(organizerAccessCode)}/create-new`).send({
    eventName: "Unblocked Event",
    eventAddress: "Unblocked Venue",
    eventDate: "2099-12-02T18:00:00.000Z",
  });
  assert.equal(response.status, 201);
});

test("partial payment increments amountPaid and keeps invoice unpaid until settled", async () => {
  await setInstruction("USD", "USD bank details");
  const event = await createEvent({ currencySymbol: "$" });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });

  const invoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "PRE_EVENT_24H" } },
  });
  const updated = await addInvoicePayment(invoice.id, {
    paymentAmount: 0.5,
    paymentNote: "first partial",
    now: new Date("2099-10-19T18:30:00.000Z"),
  });

  assert.equal(Number(updated.amountPaid).toFixed(2), "0.50");
  assert.equal(Number(updated.amountRemaining).toFixed(2), "1.48");
  assert.equal(updated.status, "SENT");
  assert.equal(updated.paymentNote, "first partial");
});

test("multiple partial payments accumulate and clamp safely on overpayment", async () => {
  await setInstruction("USD", "USD bank details");
  const event = await createEvent({ currencySymbol: "$" });

  await createApprovedTickets({ eventId: event.id, ticketCount: 2, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });

  const invoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "PRE_EVENT_24H" } },
  });

  await addInvoicePayment(invoice.id, { paymentAmount: 0.7, now: new Date("2099-10-19T18:20:00.000Z") });
  await addInvoicePayment(invoice.id, { paymentAmount: 0.7, now: new Date("2099-10-19T18:25:00.000Z") });
  const settled = await addInvoicePayment(invoice.id, { paymentAmount: 5.0, now: new Date("2099-10-19T18:30:00.000Z") });

  assert.equal(Number(settled.amountPaid).toFixed(2), "1.98");
  assert.equal(Number(settled.amountRemaining).toFixed(2), "0.00");
  assert.equal(settled.status, "PAID");
});

test("paid invoice does not become overdue after dueAt passes", async () => {
  await setInstruction("USD", "USD bank details");
  const event = await createEvent({ currencySymbol: "$" });

  await createApprovedTickets({ eventId: event.id, ticketCount: 1, createdAt: "2099-10-19T10:00:00.000Z" });
  await processPreEventInvoice(event, {
    sendInvoiceEmail: async () => {},
    sendInvoiceChat: async () => {},
    now: new Date("2099-10-19T18:00:00.000Z"),
  });

  const invoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: "PRE_EVENT_24H" } },
  });

  await addInvoicePayment(invoice.id, { paymentAmount: 0.99, now: new Date("2099-10-19T18:10:00.000Z") });
  await markOverdueInvoices({ now: new Date("2099-10-20T14:00:00.000Z") });

  const refreshed = await prisma.organizerInvoice.findUnique({ where: { id: invoice.id } });
  assert.equal(refreshed.status, "PAID");
});
