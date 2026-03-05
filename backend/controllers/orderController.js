const prisma = require("../utils/prisma");
const { sendTicketLinkEmail } = require("../utils/mailer");

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
    },
  });

  if (emails.length > tickets.length) {
    res.status(400).json({ error: "Cannot send to more emails than available tickets." });
    return;
  }

  const failed = [];
  let sent = 0;

  for (let index = 0; index < emails.length; index += 1) {
    const email = emails[index];
    const ticket = tickets[index];
    const ticketUrl = `${baseUrl}/t/${ticket.ticketPublicId}`;
    try {
      await sendTicketLinkEmail({
        to: email,
        eventName: event.eventName,
        eventDate: event.eventDate,
        eventAddress: event.eventAddress,
        ticketType: event.ticketType || "General",
        ticketUrl,
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

  res.json({ sent, failed });
}

module.exports = {
  sendOrderTicketLinks,
};

