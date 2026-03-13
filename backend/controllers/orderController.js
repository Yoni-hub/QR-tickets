const prisma = require("../utils/prisma");
const {
  sendTicketLinkEmail,
  DEFAULT_SUBJECT_TEMPLATE,
  DEFAULT_BODY_TEMPLATE,
} = require("../utils/mailer");
const {
  DEFAULT_TICKET_TYPE,
  normalizeTicketType,
  reservePendingTicketIds,
} = require("../services/pendingTicketReservations");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailList(rawEmails) {
  if (!Array.isArray(rawEmails)) return [];
  const seen = new Set();
  const normalized = [];
  for (const value of rawEmails) {
    const email = String(value || "").trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_PATTERN.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }
  return normalized;
}

function getBaseUrl(rawBaseUrl) {
  const fallback = process.env.PUBLIC_BASE_URL || "http://localhost:5174";
  return String(rawBaseUrl || fallback).trim().replace(/\/$/, "");
}

function parseTemplateField(rawValue, fallbackValue, maxLength, fieldName) {
  if (rawValue === undefined || rawValue === null) return fallbackValue;
  const value = String(rawValue);
  if (!value.trim()) {
    const error = new Error(`${fieldName} cannot be empty.`);
    error.statusCode = 400;
    throw error;
  }
  if (value.length > maxLength) {
    const error = new Error(`${fieldName} is too long.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

async function resolveEventForAccessCode(accessCode, eventIdRaw) {
  const eventId = String(eventIdRaw || "").trim();
  const directEvent = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: { id: true, organizerAccessCode: true, accessCode: true },
  });
  const organizerAccessCode = directEvent?.organizerAccessCode || directEvent?.accessCode || accessCode;

  const events = await prisma.userEvent.findMany({
    where: {
      OR: [
        { organizerAccessCode },
        { accessCode: organizerAccessCode },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      accessCode: true,
      organizerName: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      ticketType: true,
    },
  });
  if (!events.length) return null;

  if (eventId) {
    const selected = events.find((item) => item.id === eventId);
    if (selected) return selected;
  }

  const exactAccessEvent = events.find((item) => item.accessCode === accessCode);
  return exactAccessEvent || events[0];
}

async function sendOrderTicketLinks(req, res) {
  const accessCode = String(req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const emails = normalizeEmailList(req.body?.emails);
  if (!emails.length) {
    res.status(400).json({ error: "Provide at least one valid recipient email." });
    return;
  }
  const selectedTicketTypeRaw = String(req.body?.ticketType || "").trim();
  if (!selectedTicketTypeRaw) {
    res.status(400).json({ error: "ticketType is required." });
    return;
  }
  const selectedTicketType = normalizeTicketType(selectedTicketTypeRaw, selectedTicketTypeRaw);
  const allowPartial = Boolean(req.body?.allowPartial);

  let subjectTemplate;
  let bodyTemplate;
  try {
    subjectTemplate = parseTemplateField(req.body?.emailSubject, DEFAULT_SUBJECT_TEMPLATE, 300, "Email subject");
    bodyTemplate = parseTemplateField(req.body?.emailBody, DEFAULT_BODY_TEMPLATE, 8000, "Email body");
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Invalid email template." });
    return;
  }

  const baseUrl = getBaseUrl(req.body?.baseUrl);
  const event = await resolveEventForAccessCode(accessCode, req.body?.eventId || req.query?.eventId);

  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const [tickets, pendingRequests] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        eventId: event.id,
        ticketRequestId: null,
        isInvalidated: false,
        status: "UNUSED",
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ticketPublicId: true,
        ticketType: true,
        deliveries: {
          where: { status: "SENT" },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { method: true },
        },
      },
    }),
    prisma.ticketRequest.findMany({
      where: { eventId: event.id, status: "PENDING_PAYMENT" },
      orderBy: { createdAt: "asc" },
      select: { ticketType: true, quantity: true, ticketSelections: true },
    }),
  ]);

  const undeliveredTickets = tickets.filter((ticket) => !ticket.deliveries?.length);
  const reservedPendingTicketIds = reservePendingTicketIds({
    availableTickets: undeliveredTickets,
    pendingRequests,
    fallbackTicketType: event.ticketType || DEFAULT_TICKET_TYPE,
  });

  const matchingTickets = tickets.filter(
    (ticket) => normalizeTicketType(ticket.ticketType, event.ticketType || DEFAULT_TICKET_TYPE) === selectedTicketType,
  );
  const availableTickets = matchingTickets.filter(
    (ticket) => !ticket.deliveries?.length && !reservedPendingTicketIds.has(ticket.id),
  );
  const reservedForPendingCount = matchingTickets.filter((ticket) => reservedPendingTicketIds.has(ticket.id)).length;
  const downloadedCount = matchingTickets.filter((ticket) => ticket.deliveries?.[0]?.method === "PDF_DOWNLOAD").length;
  const emailedCount = matchingTickets.filter((ticket) => ticket.deliveries?.[0]?.method === "EMAIL_LINK").length;

  if (emails.length > availableTickets.length && !allowPartial) {
    if (availableTickets.length < 1 && downloadedCount > 0) {
      res.status(400).json({
        code: "INSUFFICIENT_TICKETS",
        error:
          "You downloaded all your tickets and have no tickets left to send by email. Generate more tickets first.",
        ticketType: selectedTicketType,
        availableTickets: 0,
        requestedEmails: emails.length,
        downloadedCount,
        emailedCount,
        reservedForPendingCount,
      });
      return;
    }
    res.status(400).json({
      code: "INSUFFICIENT_TICKETS",
      error: `Not enough ${selectedTicketType} tickets. You have ${availableTickets.length} available, but tried to send ${emails.length} emails. Generate more tickets.`,
      ticketType: selectedTicketType,
      availableTickets: availableTickets.length,
      requestedEmails: emails.length,
      downloadedCount,
      emailedCount,
      reservedForPendingCount,
    });
    return;
  }

  const targetEmails = allowPartial && emails.length > availableTickets.length
    ? emails.slice(0, availableTickets.length)
    : emails;
  if (!targetEmails.length) {
    res.status(400).json({
      code: "INSUFFICIENT_TICKETS",
      error: `No ${selectedTicketType} tickets are available to send by email. Generate more tickets first.`,
      ticketType: selectedTicketType,
      availableTickets: 0,
      requestedEmails: emails.length,
      downloadedCount,
      emailedCount,
      reservedForPendingCount,
    });
    return;
  }

  const failed = [];
  let sent = 0;

  for (let index = 0; index < targetEmails.length; index += 1) {
    const email = targetEmails[index];
    const ticket = availableTickets[index];
    const ticketUrl = `${baseUrl}/t/${ticket.ticketPublicId}`;
    try {
      await sendTicketLinkEmail({
        to: email,
        organizerName: event.organizerName,
        eventName: event.eventName,
        eventDate: event.eventDate,
        eventAddress: event.eventAddress,
        ticketType: ticket.ticketType || event.ticketType || DEFAULT_TICKET_TYPE,
        ticketUrl,
        subjectTemplate,
        bodyTemplate,
      });
      sent += 1;
      await prisma.ticketDelivery.create({
        data: {
          ticketId: ticket.id,
          email,
          method: "EMAIL_LINK",
          status: "SENT",
        },
      });
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { attendeeEmail: email },
      });
    } catch (error) {
      const errorMessage = error?.message || "Unknown email error.";
      failed.push({ email, ticketPublicId: ticket.ticketPublicId, error: errorMessage });
      await prisma.ticketDelivery.create({
        data: {
          ticketId: ticket.id,
          email,
          method: "EMAIL_LINK",
          status: "FAILED",
          errorMessage,
        },
      });
    }
  }

  res.json({
    sent,
    failed,
    ticketType: selectedTicketType,
    availableTicketsBeforeSend: availableTickets.length,
    requestedEmails: emails.length,
    attemptedEmails: targetEmails.length,
    partialApplied: targetEmails.length < emails.length,
  });
}

module.exports = {
  sendOrderTicketLinks,
};
