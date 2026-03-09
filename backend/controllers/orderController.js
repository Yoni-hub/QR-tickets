const prisma = require("../utils/prisma");
const {
  sendTicketLinkEmail,
  DEFAULT_SUBJECT_TEMPLATE,
  DEFAULT_BODY_TEMPLATE,
} = require("../utils/mailer");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TICKET_TYPE = "General";

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

function normalizeTicketType(value) {
  return String(value || "").trim();
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
  const selectedTicketType = normalizeTicketType(req.body?.ticketType);
  if (!selectedTicketType) {
    res.status(400).json({ error: "ticketType is required." });
    return;
  }

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
  const event = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: {
      id: true,
      accessCode: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      ticketType: true,
    },
  });

  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const tickets = await prisma.ticket.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      ticketPublicId: true,
      status: true,
      ticketType: true,
      deliveries: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  const matchingTickets = tickets.filter(
    (ticket) => normalizeTicketType(ticket.ticketType || event.ticketType || DEFAULT_TICKET_TYPE) === selectedTicketType,
  );
  const availableTickets = matchingTickets.filter((ticket) => ticket.deliveries[0]?.status !== "SENT");

  if (emails.length > availableTickets.length) {
    res.status(400).json({
      error: `Not enough ${selectedTicketType} tickets. You have ${availableTickets.length} available, but tried to send ${emails.length} emails. Generate more tickets.`,
      ticketType: selectedTicketType,
      availableTickets: availableTickets.length,
      requestedEmails: emails.length,
    });
    return;
  }

  const failed = [];
  let sent = 0;

  for (let index = 0; index < emails.length; index += 1) {
    const email = emails[index];
    const ticket = availableTickets[index];
    const ticketUrl = `${baseUrl}/t/${ticket.ticketPublicId}`;
    try {
      await sendTicketLinkEmail({
        to: email,
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
  });
}

module.exports = {
  sendOrderTicketLinks,
};
