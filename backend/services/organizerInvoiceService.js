const prisma = require("../utils/prisma");
const logger = require("../utils/logger");
const { sendOrganizerInvoiceEmail, sendOrganizerBillingUpdateEmail } = require("../utils/mailer");
const { CHAT_ACTOR, CHAT_CONVERSATION_TYPE, startConversationForActor, sendMessageForActor } = require("./chatService");

const INVOICE_WINDOW_HOURS_BEFORE_EVENT = 24;
const INVOICE_DUE_HOURS_BEFORE_EVENT = 5;
const FINAL_INVOICE_TRIGGER_MINUTES_AFTER_EVENT_END = 30;
const FINAL_INVOICE_DUE_HOURS_AFTER_GENERATION = 3;
const PRE_EVENT_INVOICE_TYPE = "PRE_EVENT_24H";
const FINAL_INVOICE_TYPE = "POST_EVENT_FINAL";
const SUPPORTED_CURRENCIES = ["ETB", "USD", "EUR"];
const BLOCK_NEW_EVENT_MESSAGE = "You currently have an unpaid overdue balance. New event creation is temporarily blocked until the outstanding invoice is paid in full.";
const PRE_EVENT_WARNING_MESSAGE = "Payment is due no later than 5 hours before your event start time. If payment is not received by then, you may experience scanning problems during your event.";
const PAYMENT_CONFIRMATION_MESSAGE = "Payment received. If additional tickets are sold before your event ends, a final invoice will be issued for any remaining balance.";
const FINAL_INVOICE_MESSAGE = "This is your final event invoice, including any additional sales recorded through the end of the event. Please complete payment within the next 3 hours.";

const MARK_PAID_ALLOWED_STATUSES = new Set(["SENT", "OVERDUE", "PARTIAL_SEND_FAILED", "FAILED", "BLOCKED_MISSING_INSTRUCTION"]);
const ADD_PAYMENT_ALLOWED_STATUSES = new Set(["PENDING", "SENT", "OVERDUE", "PARTIAL_SEND_FAILED", "FAILED", "BLOCKED_MISSING_INSTRUCTION"]);
const OVERDUE_ELIGIBLE_STATUSES = ["SENT", "PARTIAL_SEND_FAILED"];

const UNIT_PRICE_BY_CURRENCY = {
  ETB: 5,
  USD: 0.99,
  EUR: 0.99,
};

function normalizeCurrency(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "ETB" || raw === "BR" || raw === "BIRR") return "ETB";
  if (raw === "$" || raw === "USD") return "USD";
  if (raw === "€" || raw === "EUR") return "EUR";
  if (SUPPORTED_CURRENCIES.includes(raw)) return raw;
  return "USD";
}

function resolveEventCurrency(event) {
  const designCurrency = String(event?.designJson?.currency || "").trim();
  return normalizeCurrency(designCurrency);
}

function roundMoney(value) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) return 0;
  return Number(numberValue.toFixed(2));
}

function toDecimalValue(value) {
  return roundMoney(value).toFixed(2);
}

function computeAmountRemaining(totalAmount, amountPaid) {
  return roundMoney(roundMoney(totalAmount) - roundMoney(amountPaid));
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computePreInvoiceDueAt(eventDate) {
  const startAt = toIsoDate(eventDate);
  if (!startAt) return null;
  return new Date(startAt.getTime() - INVOICE_DUE_HOURS_BEFORE_EVENT * 60 * 60 * 1000);
}

function computeFinalInvoiceDueAt(generatedAt) {
  const generated = toIsoDate(generatedAt);
  if (!generated) return null;
  return new Date(generated.getTime() + FINAL_INVOICE_DUE_HOURS_AFTER_GENERATION * 60 * 60 * 1000);
}

function resolveEventEndAt(event) {
  return toIsoDate(event?.eventEndDate) || toIsoDate(event?.eventDate);
}

function buildInvoiceChatMessage({
  invoiceType,
  eventName,
  eventDate,
  currency,
  approvedTicketCount,
  unitPrice,
  totalAmount,
  dueAt,
  paymentInstruction,
}) {
  const eventLine = eventDate ? `Event starts: ${new Date(eventDate).toLocaleString()}` : null;
  const message = invoiceType === FINAL_INVOICE_TYPE ? FINAL_INVOICE_MESSAGE : PRE_EVENT_WARNING_MESSAGE;
  return [
    `Invoice generated for ${eventName}.`,
    `Approved tickets: ${approvedTicketCount}`,
    `Rate: ${currency} ${roundMoney(unitPrice).toFixed(2)} per ticket`,
    `Total amount: ${currency} ${roundMoney(totalAmount).toFixed(2)}`,
    eventLine,
    `Payment due by: ${new Date(dueAt).toLocaleString()}`,
    message,
    `Payment instructions: ${paymentInstruction}`,
  ].filter(Boolean).join("\n");
}

async function countApprovedTicketsSnapshot(eventId, options = {}) {
  const where = {
    eventId,
    cancelledAt: null,
    ticketRequestId: { not: null },
    ticketRequest: { status: "APPROVED" },
  };
  if (options.upTo instanceof Date) {
    where.createdAt = { lte: options.upTo };
  }
  return prisma.ticket.count({ where });
}

async function sumEventPayments(eventId) {
  const aggregate = await prisma.organizerInvoice.aggregate({
    where: { eventId },
    _sum: { amountPaid: true },
  });
  return roundMoney(aggregate?._sum?.amountPaid);
}

async function sendMessageToOrganizerChat(event, message) {
  const organizerAccessCode = String(event.organizerAccessCode || event.accessCode || "").trim();
  if (!organizerAccessCode) throw new Error("Organizer access code is missing for invoice chat delivery.");

  const adminActor = { type: CHAT_ACTOR.ADMIN };
  const conversationId = await startConversationForActor(adminActor, {
    conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_ADMIN,
    organizerAccessCode,
    eventId: event.id,
    subject: "Organizer Invoice",
  });
  await sendMessageForActor(adminActor, conversationId, { message });
}

function resolveInvoiceStatus({ emailSent, chatSent, blockedMissingInstruction }) {
  if (blockedMissingInstruction) return "BLOCKED_MISSING_INSTRUCTION";
  if (emailSent && chatSent) return "SENT";
  if (emailSent || chatSent) return "PARTIAL_SEND_FAILED";
  return "FAILED";
}

function isSettledInvoiceStatus(status) {
  return ["PAID", "SENT", "OVERDUE", "PARTIAL_SEND_FAILED"].includes(String(status || ""));
}

async function upsertBlockedInvoice({
  event,
  invoiceType,
  previousInvoiceId,
  organizerEmail,
  currency,
  approvedTicketCount,
  unitPrice,
  totalAmount,
  generatedAt,
  dueAt,
}) {
  const row = await prisma.organizerInvoice.upsert({
    where: {
      eventId_invoiceType: { eventId: event.id, invoiceType },
    },
    create: {
      eventId: event.id,
      invoiceType,
      previousInvoiceId: previousInvoiceId || null,
      organizerEmailSnapshot: organizerEmail || "",
      currencySnapshot: currency,
      approvedTicketCountSnapshot: approvedTicketCount,
      unitPriceSnapshot: toDecimalValue(unitPrice),
      totalAmountSnapshot: toDecimalValue(totalAmount),
      totalAmount: toDecimalValue(totalAmount),
      amountPaid: "0.00",
      paymentInstructionSnapshot: null,
      generatedAt,
      dueAt,
      status: "BLOCKED_MISSING_INSTRUCTION",
      paidAt: null,
      paymentNote: null,
      sentByEmailAt: null,
      sentByChatAt: null,
      emailError: `Missing payment instructions for ${currency}.`,
      chatError: null,
    },
    update: {
      previousInvoiceId: previousInvoiceId || null,
      organizerEmailSnapshot: organizerEmail || "",
      currencySnapshot: currency,
      approvedTicketCountSnapshot: approvedTicketCount,
      unitPriceSnapshot: toDecimalValue(unitPrice),
      totalAmountSnapshot: toDecimalValue(totalAmount),
      totalAmount: toDecimalValue(totalAmount),
      amountPaid: "0.00",
      paymentInstructionSnapshot: null,
      generatedAt,
      dueAt,
      status: "BLOCKED_MISSING_INSTRUCTION",
      paidAt: null,
      paymentNote: null,
      sentByEmailAt: null,
      sentByChatAt: null,
      emailError: `Missing payment instructions for ${currency}.`,
      chatError: null,
    },
  });
  return row;
}

async function sendInvoiceChannels({
  event,
  organizerEmail,
  invoiceType,
  currency,
  approvedTicketCount,
  unitPrice,
  totalAmount,
  dueAt,
  paymentInstruction,
  sendInvoiceEmail,
  sendInvoiceChat,
}) {
  let emailSent = false;
  let chatSent = false;
  let emailError = null;
  let chatError = null;

  if (!organizerEmail) {
    emailError = "Organizer email is missing; invoice email could not be sent.";
  } else {
    try {
      await sendInvoiceEmail({
        to: organizerEmail,
        eventName: event.eventName,
        eventDate: event.eventDate,
        dueAt,
        currency,
        approvedTicketCount,
        unitPrice,
        totalAmount,
        paymentInstruction,
        noticeMessage: invoiceType === FINAL_INVOICE_TYPE ? FINAL_INVOICE_MESSAGE : PRE_EVENT_WARNING_MESSAGE,
      });
      emailSent = true;
    } catch (error) {
      emailError = error?.message || "Failed to send invoice email.";
    }
  }

  try {
    const chatMessage = buildInvoiceChatMessage({
      invoiceType,
      eventName: event.eventName,
      eventDate: event.eventDate,
      currency,
      approvedTicketCount,
      unitPrice,
      totalAmount,
      dueAt,
      paymentInstruction,
    });
    await sendInvoiceChat({ event, message: chatMessage });
    chatSent = true;
  } catch (error) {
    chatError = error?.message || "Failed to send invoice chat message.";
  }

  return { emailSent, chatSent, emailError, chatError };
}

async function processInvoiceForEvent({
  event,
  invoiceType,
  totalAmount,
  approvedTicketCount,
  unitPrice,
  generatedAt,
  dueAt,
  previousInvoiceId,
  options = {},
}) {
  const sendInvoiceEmail = options.sendInvoiceEmail || sendOrganizerInvoiceEmail;
  const sendInvoiceChat = options.sendInvoiceChat || sendMessageToOrganizerChat;
  const organizerEmail = String(event.organizerEmail || "").trim().toLowerCase();
  const currency = resolveEventCurrency(event);

  const existingInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType } },
    select: { id: true, status: true },
  });
  if (existingInvoice && isSettledInvoiceStatus(existingInvoice.status)) {
    return { status: "SKIPPED_ALREADY_INVOICED", invoiceId: existingInvoice.id };
  }

  const instructionRow = await prisma.adminCurrencyPaymentInstruction.findUnique({
    where: { currency },
    select: { instructionText: true },
  });
  const paymentInstruction = String(instructionRow?.instructionText || "").trim();

  if (!paymentInstruction) {
    const blockedInvoice = await upsertBlockedInvoice({
      event,
      invoiceType,
      previousInvoiceId,
      organizerEmail,
      currency,
      approvedTicketCount,
      unitPrice,
      totalAmount,
      generatedAt,
      dueAt,
    });
    return { status: "BLOCKED_MISSING_INSTRUCTION", invoiceId: blockedInvoice.id };
  }

  let invoice = await prisma.organizerInvoice.upsert({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType } },
    create: {
      eventId: event.id,
      invoiceType,
      previousInvoiceId: previousInvoiceId || null,
      organizerEmailSnapshot: organizerEmail || "",
      currencySnapshot: currency,
      approvedTicketCountSnapshot: approvedTicketCount,
      unitPriceSnapshot: toDecimalValue(unitPrice),
      totalAmountSnapshot: toDecimalValue(totalAmount),
      totalAmount: toDecimalValue(totalAmount),
      amountPaid: "0.00",
      paymentInstructionSnapshot: paymentInstruction,
      generatedAt,
      dueAt,
      status: "PENDING",
      paidAt: null,
      paymentNote: null,
    },
    update: {
      previousInvoiceId: previousInvoiceId || null,
      organizerEmailSnapshot: organizerEmail || "",
      currencySnapshot: currency,
      approvedTicketCountSnapshot: approvedTicketCount,
      unitPriceSnapshot: toDecimalValue(unitPrice),
      totalAmountSnapshot: toDecimalValue(totalAmount),
      totalAmount: toDecimalValue(totalAmount),
      amountPaid: "0.00",
      paymentInstructionSnapshot: paymentInstruction,
      generatedAt,
      dueAt,
      status: "PENDING",
      paidAt: null,
      paymentNote: null,
      sentByEmailAt: null,
      sentByChatAt: null,
      emailError: null,
      chatError: null,
    },
  });

  const channelResult = await sendInvoiceChannels({
    event,
    organizerEmail,
    invoiceType,
    currency,
    approvedTicketCount,
    unitPrice,
    totalAmount,
    dueAt,
    paymentInstruction,
    sendInvoiceEmail,
    sendInvoiceChat,
  });
  const status = resolveInvoiceStatus({
    emailSent: channelResult.emailSent,
    chatSent: channelResult.chatSent,
    blockedMissingInstruction: false,
  });

  invoice = await prisma.organizerInvoice.update({
    where: { id: invoice.id },
    data: {
      status,
      sentByEmailAt: channelResult.emailSent ? new Date() : null,
      sentByChatAt: channelResult.chatSent ? new Date() : null,
      emailError: channelResult.emailError,
      chatError: channelResult.chatError,
    },
  });

  return { status, invoiceId: invoice.id };
}

async function processPreEventInvoice(event, options = {}) {
  const currency = resolveEventCurrency(event);
  const unitPrice = UNIT_PRICE_BY_CURRENCY[currency];
  const generatedAt = options.now instanceof Date ? options.now : new Date();
  const dueAt = computePreInvoiceDueAt(event.eventDate);
  if (!dueAt) throw new Error(`Invalid eventDate for event ${event.id}`);

  const approvedTicketCount = await countApprovedTicketsSnapshot(event.id);
  const totalAmount = roundMoney(approvedTicketCount * unitPrice);

  return processInvoiceForEvent({
    event,
    invoiceType: PRE_EVENT_INVOICE_TYPE,
    totalAmount,
    approvedTicketCount,
    unitPrice,
    generatedAt,
    dueAt,
    previousInvoiceId: null,
    options,
  });
}

async function processFinalSettlementInvoice(event, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const eventEndAt = resolveEventEndAt(event);
  if (!eventEndAt) {
    return { status: "SKIPPED_NO_EVENT_END", eventId: event.id };
  }
  const finalCutoff = new Date(eventEndAt.getTime() + FINAL_INVOICE_TRIGGER_MINUTES_AFTER_EVENT_END * 60 * 1000);
  if (now < finalCutoff) {
    return { status: "SKIPPED_NOT_READY", eventId: event.id };
  }

  const existingFinal = await prisma.organizerInvoice.findUnique({
    where: {
      eventId_invoiceType: { eventId: event.id, invoiceType: FINAL_INVOICE_TYPE },
    },
    select: { id: true, status: true },
  });
  if (existingFinal && isSettledInvoiceStatus(existingFinal.status)) {
    return { status: "SKIPPED_ALREADY_INVOICED", invoiceId: existingFinal.id };
  }

  const currency = resolveEventCurrency(event);
  const unitPrice = UNIT_PRICE_BY_CURRENCY[currency];
  const approvedTicketCount = await countApprovedTicketsSnapshot(event.id, { upTo: eventEndAt });
  const totalCharges = roundMoney(approvedTicketCount * unitPrice);
  const totalPaid = await sumEventPayments(event.id);
  const remaining = computeAmountRemaining(totalCharges, totalPaid);
  if (remaining <= 0) {
    return { status: "NO_BALANCE_DUE", eventId: event.id };
  }

  const preInvoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId: event.id, invoiceType: PRE_EVENT_INVOICE_TYPE } },
    select: { id: true },
  });
  const generatedAt = now;
  const dueAt = computeFinalInvoiceDueAt(generatedAt);
  if (!dueAt) throw new Error(`Invalid generated date for final invoice event ${event.id}`);

  return processInvoiceForEvent({
    event,
    invoiceType: FINAL_INVOICE_TYPE,
    totalAmount: remaining,
    approvedTicketCount,
    unitPrice,
    generatedAt,
    dueAt,
    previousInvoiceId: preInvoice?.id || null,
    options,
  });
}

async function runOrganizerInvoiceGenerationCycle(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const overdueUpdated = await markOverdueInvoices({ now });
  const windowEnd = new Date(now.getTime() + INVOICE_WINDOW_HOURS_BEFORE_EVENT * 60 * 60 * 1000);

  const preEvents = await prisma.userEvent.findMany({
    where: {
      adminStatus: "ACTIVE",
      isDemo: false,
      eventDate: { gt: now, lte: windowEnd },
    },
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
      organizerEmail: true,
      accessCode: true,
      organizerAccessCode: true,
      designJson: true,
    },
    orderBy: { eventDate: "asc" },
    take: 500,
  });

  const preResults = [];
  for (const event of preEvents) {
    try {
      const result = await processPreEventInvoice(event, options);
      preResults.push({ eventId: event.id, ...result });
    } catch (error) {
      logger.error("Organizer pre-event invoice cycle failed for event", {
        eventId: event.id,
        error: error?.message || "unknown",
      });
      preResults.push({ eventId: event.id, status: "FAILED", error: error?.message || "Unknown error" });
    }
  }

  const finalWindow = new Date(now.getTime() - FINAL_INVOICE_TRIGGER_MINUTES_AFTER_EVENT_END * 60 * 1000);
  const finalEvents = await prisma.userEvent.findMany({
    where: {
      isDemo: false,
      OR: [
        { eventEndDate: { not: null, lte: finalWindow } },
        { eventEndDate: null, eventDate: { lte: finalWindow } },
      ],
    },
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
      organizerEmail: true,
      accessCode: true,
      organizerAccessCode: true,
      designJson: true,
    },
    orderBy: { eventDate: "asc" },
    take: 500,
  });

  const finalResults = [];
  for (const event of finalEvents) {
    try {
      const result = await processFinalSettlementInvoice(event, options);
      finalResults.push({ eventId: event.id, ...result });
    } catch (error) {
      logger.error("Organizer final invoice cycle failed for event", {
        eventId: event.id,
        error: error?.message || "unknown",
      });
      finalResults.push({ eventId: event.id, status: "FAILED", error: error?.message || "Unknown error" });
    }
  }

  return {
    overdueUpdated,
    scannedEvents: preEvents.length,
    preResults,
    finalScannedEvents: finalEvents.length,
    finalResults,
  };
}

async function markOverdueInvoices(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const result = await prisma.organizerInvoice.updateMany({
    where: {
      dueAt: { lt: now },
      status: { in: OVERDUE_ELIGIBLE_STATUSES },
    },
    data: { status: "OVERDUE" },
  });
  return result.count || 0;
}

async function sendPaymentConfirmationNotice(invoice, event) {
  const organizerEmail = String(invoice.organizerEmailSnapshot || event?.organizerEmail || "").trim().toLowerCase();
  if (organizerEmail) {
    try {
      await sendOrganizerBillingUpdateEmail({
        to: organizerEmail,
        eventName: event?.eventName,
        message: PAYMENT_CONFIRMATION_MESSAGE,
      });
    } catch (error) {
      logger.warn("Failed to send organizer payment confirmation email", {
        invoiceId: invoice.id,
        eventId: event?.id,
        error: error?.message || "unknown",
      });
    }
  }

  try {
    await sendMessageToOrganizerChat(event, PAYMENT_CONFIRMATION_MESSAGE);
  } catch (error) {
    logger.warn("Failed to send organizer payment confirmation chat message", {
      invoiceId: invoice.id,
      eventId: event?.id,
      error: error?.message || "unknown",
    });
  }
}

async function markInvoicePaid(invoiceId, options = {}) {
  const normalizedId = String(invoiceId || "").trim();
  if (!normalizedId) {
    const error = new Error("invoiceId is required.");
    error.code = "BAD_INPUT";
    throw error;
  }

  const paymentNote = String(options.paymentNote || "").trim();
  if (paymentNote.length > 500) {
    const error = new Error("paymentNote is too long.");
    error.code = "BAD_INPUT";
    throw error;
  }

  const invoice = await prisma.organizerInvoice.findUnique({
    where: { id: normalizedId },
    select: {
      id: true,
      eventId: true,
      status: true,
      dueAt: true,
      totalAmount: true,
      amountPaid: true,
      organizerEmailSnapshot: true,
      currencySnapshot: true,
      invoiceType: true,
    },
  });
  if (!invoice) {
    const error = new Error("Invoice not found.");
    error.code = "NOT_FOUND";
    throw error;
  }
  if (!MARK_PAID_ALLOWED_STATUSES.has(invoice.status)) {
    const error = new Error(`Invoice in status ${invoice.status} cannot be marked as PAID.`);
    error.code = "INVALID_TRANSITION";
    throw error;
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const totalAmount = roundMoney(invoice.totalAmount);
  const amountPaidInput = options.amountPaid == null ? totalAmount : roundMoney(options.amountPaid);
  const nextAmountPaid = Math.min(totalAmount, Math.max(0, amountPaidInput));
  const remaining = computeAmountRemaining(totalAmount, nextAmountPaid);
  const nextStatus = remaining <= 0 ? "PAID" : (invoice.dueAt < now ? "OVERDUE" : "SENT");

  const updated = await prisma.organizerInvoice.update({
    where: { id: normalizedId },
    data: {
      amountPaid: toDecimalValue(nextAmountPaid),
      status: nextStatus,
      paidAt: nextAmountPaid > 0 ? now : null,
      paymentNote: paymentNote || null,
    },
    select: {
      id: true,
      eventId: true,
      status: true,
      dueAt: true,
      totalAmount: true,
      amountPaid: true,
      paidAt: true,
      paymentNote: true,
      invoiceType: true,
    },
  });

  if (updated.status === "PAID") {
    const event = await prisma.userEvent.findUnique({
      where: { id: updated.eventId },
      select: { id: true, eventName: true, organizerEmail: true, organizerAccessCode: true, accessCode: true },
    });
    if (event) {
      await sendPaymentConfirmationNotice({ ...invoice, ...updated }, event);
    }
  }

  return {
    ...updated,
    amountRemaining: computeAmountRemaining(updated.totalAmount, updated.amountPaid),
  };
}

async function addInvoicePayment(invoiceId, options = {}) {
  const normalizedId = String(invoiceId || "").trim();
  if (!normalizedId) {
    const error = new Error("invoiceId is required.");
    error.code = "BAD_INPUT";
    throw error;
  }

  const paymentNote = String(options.paymentNote || "").trim();
  if (paymentNote.length > 500) {
    const error = new Error("paymentNote is too long.");
    error.code = "BAD_INPUT";
    throw error;
  }

  const rawPaymentAmount = Number(options.paymentAmount ?? options.amount);
  const paymentAmount = roundMoney(rawPaymentAmount);
  if (!Number.isFinite(rawPaymentAmount) || paymentAmount <= 0) {
    const error = new Error("paymentAmount must be greater than 0.");
    error.code = "BAD_INPUT";
    throw error;
  }

  const invoice = await prisma.organizerInvoice.findUnique({
    where: { id: normalizedId },
    select: {
      id: true,
      eventId: true,
      status: true,
      dueAt: true,
      totalAmount: true,
      amountPaid: true,
      paidAt: true,
      paymentNote: true,
      invoiceType: true,
      organizerEmailSnapshot: true,
      currencySnapshot: true,
    },
  });
  if (!invoice) {
    const error = new Error("Invoice not found.");
    error.code = "NOT_FOUND";
    throw error;
  }
  if (!ADD_PAYMENT_ALLOWED_STATUSES.has(invoice.status)) {
    const error = new Error(`Invoice in status ${invoice.status} does not accept additional payment.`);
    error.code = "INVALID_TRANSITION";
    throw error;
  }

  const totalAmount = roundMoney(invoice.totalAmount);
  const currentPaid = roundMoney(invoice.amountPaid);
  if (currentPaid >= totalAmount) {
    const error = new Error("Invoice is already fully paid.");
    error.code = "INVALID_TRANSITION";
    throw error;
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const nextAmountPaid = Math.min(totalAmount, roundMoney(currentPaid + paymentAmount));
  const appliedAmount = roundMoney(nextAmountPaid - currentPaid);
  const amountRemaining = computeAmountRemaining(totalAmount, nextAmountPaid);
  const nextStatus = amountRemaining <= 0 ? "PAID" : (invoice.dueAt < now ? "OVERDUE" : "SENT");

  const updated = await prisma.organizerInvoice.update({
    where: { id: normalizedId },
    data: {
      amountPaid: toDecimalValue(nextAmountPaid),
      status: nextStatus,
      paidAt: amountRemaining <= 0 ? (invoice.paidAt || now) : null,
      paymentNote: paymentNote || invoice.paymentNote || null,
    },
    select: {
      id: true,
      eventId: true,
      status: true,
      dueAt: true,
      totalAmount: true,
      amountPaid: true,
      paidAt: true,
      paymentNote: true,
      invoiceType: true,
    },
  });

  if (updated.status === "PAID" && invoice.status !== "PAID") {
    const event = await prisma.userEvent.findUnique({
      where: { id: updated.eventId },
      select: { id: true, eventName: true, organizerEmail: true, organizerAccessCode: true, accessCode: true },
    });
    if (event) {
      await sendPaymentConfirmationNotice({ ...invoice, ...updated }, event);
    }
  }

  return {
    ...updated,
    amountRemaining,
    paymentAdded: appliedAmount,
    paymentRequested: paymentAmount,
  };
}

async function isOrganizerBlockedFromNewEvents(organizerAccessCode) {
  const code = String(organizerAccessCode || "").trim();
  if (!code) return false;
  const overdueFinal = await prisma.organizerInvoice.findFirst({
    where: {
      invoiceType: FINAL_INVOICE_TYPE,
      status: "OVERDUE",
      event: {
        OR: [
          { organizerAccessCode: code },
          { accessCode: code },
        ],
      },
    },
    select: { id: true },
  });
  return Boolean(overdueFinal);
}

async function getPreEventUnpaidWarning(eventId, eventDate, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const eventStart = toIsoDate(eventDate);
  if (!eventStart) return null;
  const dueAt = computePreInvoiceDueAt(eventStart);
  if (!dueAt) return null;
  if (now < dueAt || now >= eventStart) return null;

  const invoice = await prisma.organizerInvoice.findUnique({
    where: { eventId_invoiceType: { eventId, invoiceType: PRE_EVENT_INVOICE_TYPE } },
    select: { status: true, totalAmount: true, amountPaid: true },
  });
  if (!invoice) return null;
  if (invoice.status === "PAID") return null;
  if (computeAmountRemaining(invoice.totalAmount, invoice.amountPaid) <= 0) return null;

  return PRE_EVENT_WARNING_MESSAGE;
}

module.exports = {
  SUPPORTED_CURRENCIES,
  UNIT_PRICE_BY_CURRENCY,
  PRE_EVENT_INVOICE_TYPE,
  FINAL_INVOICE_TYPE,
  BLOCK_NEW_EVENT_MESSAGE,
  PRE_EVENT_WARNING_MESSAGE,
  PAYMENT_CONFIRMATION_MESSAGE,
  FINAL_INVOICE_MESSAGE,
  normalizeCurrency,
  resolveEventCurrency,
  markOverdueInvoices,
  markInvoicePaid,
  addInvoicePayment,
  isOrganizerBlockedFromNewEvents,
  getPreEventUnpaidWarning,
  runOrganizerInvoiceGenerationCycle,
  processPreEventInvoice,
  processFinalSettlementInvoice,
};
