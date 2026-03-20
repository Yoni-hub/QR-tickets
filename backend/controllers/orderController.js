const prisma = require("../utils/prisma");
const { sendTicketLinksDigestEmail } = require("../utils/mailer");
const {
  DEFAULT_TICKET_TYPE,
  normalizeTicketType,
  reservePendingTicketIds,
} = require("../services/pendingTicketReservations");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

function getBaseUrl(rawBaseUrl) {
  const fallback = process.env.PUBLIC_BASE_URL || "http://localhost:5174";
  return String(rawBaseUrl || fallback).trim().replace(/\/$/, "");
}

async function resolveEventForAccessCode(accessCode, eventIdRaw) {
  const eventId = String(eventIdRaw || "").trim();
  const directEvent = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: { id: true, organizerAccessCode: true, accessCode: true },
  });
  const organizerAccessCode =
    directEvent?.organizerAccessCode || directEvent?.accessCode || accessCode;

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

/**
 * Parses the recipients from the request body.
 *
 * Accepts two formats:
 *   New format: recipients = [{email, selections: [{ticketType, quantity}]}]
 *   Legacy format: emails = [string], ticketType = string   (1 ticket per email, 1 type)
 *
 * Always returns the new format.
 */
function parseRecipients(body) {
  if (Array.isArray(body?.recipients) && body.recipients.length) {
    const result = [];
    for (const r of body.recipients) {
      const email = normalizeEmail(r?.email);
      if (!EMAIL_PATTERN.test(email)) continue;
      const selections = [];
      if (Array.isArray(r?.selections)) {
        for (const s of r.selections) {
          const qty = Math.max(0, parseInt(s?.quantity || 0, 10));
          const type = String(s?.ticketType || "").trim();
          if (qty > 0 && type) selections.push({ ticketType: type, quantity: qty });
        }
      }
      if (selections.length) result.push({ email, selections });
    }
    return { recipients: result, error: null };
  }

  // Legacy: emails[] + ticketType
  if (Array.isArray(body?.emails) && body.emails.length) {
    const ticketType = String(body?.ticketType || "").trim();
    if (!ticketType) return { recipients: [], error: "ticketType is required." };
    const seen = new Set();
    const result = [];
    for (const raw of body.emails) {
      const email = normalizeEmail(raw);
      if (!EMAIL_PATTERN.test(email) || seen.has(email)) continue;
      seen.add(email);
      result.push({ email, selections: [{ ticketType, quantity: 1 }] });
    }
    return { recipients: result, error: null };
  }

  return { recipients: [], error: "Provide at least one recipient." };
}

async function sendOrderTicketLinks(req, res) {
  const accessCode = String(req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const { recipients, error: parseError } = parseRecipients(req.body);
  if (parseError) {
    res.status(400).json({ error: parseError });
    return;
  }
  if (!recipients.length) {
    res.status(400).json({ error: "Provide at least one valid recipient." });
    return;
  }

  const baseUrl = getBaseUrl(req.body?.baseUrl);
  const event = await resolveEventForAccessCode(
    accessCode,
    req.body?.eventId || req.query?.eventId,
  );
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  // Load all available tickets for this event (unassigned, unused, not invalidated)
  const [allTickets, pendingRequests] = await Promise.all([
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
          take: 1,
          select: { method: true },
        },
      },
    }),
    prisma.ticketRequest.findMany({
      where: { eventId: event.id, status: "PENDING_VERIFICATION" },
      orderBy: { createdAt: "asc" },
      select: { ticketType: true, quantity: true, ticketSelections: true },
    }),
  ]);

  const undelivered = allTickets.filter((t) => !t.deliveries?.length);
  const reservedIds = reservePendingTicketIds({
    availableTickets: undelivered,
    pendingRequests,
    fallbackTicketType: event.ticketType || DEFAULT_TICKET_TYPE,
  });

  // Build a pool of available tickets per normalized type (excluding reserved)
  const availableByType = new Map();
  for (const ticket of undelivered) {
    if (reservedIds.has(ticket.id)) continue;
    const type = normalizeTicketType(
      ticket.ticketType,
      event.ticketType || DEFAULT_TICKET_TYPE,
    );
    if (!availableByType.has(type)) availableByType.set(type, []);
    availableByType.get(type).push(ticket);
  }

  // Pre-flight: check we have enough tickets for all recipients combined
  const totalNeededByType = new Map();
  for (const r of recipients) {
    for (const s of r.selections) {
      const type = normalizeTicketType(s.ticketType, event.ticketType || DEFAULT_TICKET_TYPE);
      totalNeededByType.set(type, (totalNeededByType.get(type) || 0) + s.quantity);
    }
  }

  for (const [type, needed] of totalNeededByType.entries()) {
    const available = availableByType.get(type)?.length || 0;
    if (needed > available) {
      res.status(400).json({
        code: "INSUFFICIENT_TICKETS",
        error: `Not enough ${type} tickets. Need ${needed}, have ${available} available.`,
        ticketType: type,
        needed,
        available,
      });
      return;
    }
  }

  // Send — one digest email per recipient
  const results = [];
  let totalSent = 0;
  const failed = [];

  for (const recipient of recipients) {
    const assignedTickets = [];

    // Assign tickets from the pool
    for (const s of recipient.selections) {
      const type = normalizeTicketType(s.ticketType, event.ticketType || DEFAULT_TICKET_TYPE);
      const pool = availableByType.get(type) || [];
      const batch = pool.splice(0, s.quantity); // removes from pool so they can't be reused
      for (const ticket of batch) {
        assignedTickets.push({ ticket, ticketType: type });
      }
    }

    if (!assignedTickets.length) continue;

    const ticketLinks = assignedTickets.map(({ ticket, ticketType }) => ({
      ticketType,
      ticketUrl: `${baseUrl}/t/${ticket.ticketPublicId}`,
    }));

    try {
      await sendTicketLinksDigestEmail({
        to: recipient.email,
        eventName: event.eventName,
        eventDate: event.eventDate,
        eventAddress: event.eventAddress,
        ticketLinks,
      });

      // Record deliveries and stamp attendee email
      for (const { ticket } of assignedTickets) {
        await prisma.ticketDelivery.create({
          data: {
            ticketId: ticket.id,
            email: recipient.email,
            method: "EMAIL_LINK",
            status: "SENT",
          },
        });
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { attendeeEmail: recipient.email },
        });
      }

      totalSent += assignedTickets.length;
      results.push({ email: recipient.email, sent: assignedTickets.length, status: "sent" });
    } catch (err) {
      const errorMessage = err?.message || "Unknown email error.";
      for (const { ticket } of assignedTickets) {
        await prisma.ticketDelivery.create({
          data: {
            ticketId: ticket.id,
            email: recipient.email,
            method: "EMAIL_LINK",
            status: "FAILED",
            errorMessage,
          },
        });
      }
      failed.push({ email: recipient.email, tickets: assignedTickets.length, error: errorMessage });
      results.push({ email: recipient.email, sent: 0, status: "failed", error: errorMessage });
    }
  }

  res.json({
    totalSent,
    failed,
    results,
    recipients: recipients.length,
  });
}

module.exports = {
  sendOrderTicketLinks,
};
