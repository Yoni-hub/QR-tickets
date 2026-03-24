const prisma = require("../utils/prisma");
const { LIMITS, sanitizeText } = require("../utils/sanitize");

function trackFailedScan(req, wasInvalid) {
  const map = req.app.failedScanCounts;
  if (!map) return;
  const ip = req.ip;
  const threshold = req.app.FAILED_SCAN_THRESHOLD;
  const blockDuration = req.app.FAILED_SCAN_BLOCK_DURATION;

  if (!wasInvalid) {
    map.delete(ip);
    return;
  }
  const entry = map.get(ip) || { count: 0, blockedUntil: null };
  entry.count += 1;
  if (entry.count >= threshold) {
    entry.blockedUntil = Date.now() + blockDuration;
    entry.count = 0;
  }
  map.set(ip, entry);
}

function resolveScanOutcomeLabel(outcome) {
  if (outcome === "VALID") return "VALID";
  if (outcome === "ALREADY_USED") return "ALREADY USED";
  if (outcome === "WRONG_EVENT") return "WRONG EVENT";
  if (outcome === "WRONG_DATE_SESSION") return "WRONG DATE / SESSION";
  if (outcome === "CANCELED") return "CANCELED";
  if (outcome === "BLOCKED") return "BLOCKED";
  if (outcome === "DUPLICATE_SCAN") return "DUPLICATE SCAN";
  return "INVALID TICKET";
}

function resolveSupportingText(outcome) {
  if (outcome === "VALID") return "Entry granted";
  if (outcome === "ALREADY_USED") return "Ticket already scanned";
  if (outcome === "WRONG_EVENT") return "Ticket belongs to another event";
  if (outcome === "WRONG_DATE_SESSION") return "Ticket is not valid for this session";
  if (outcome === "CANCELED") return "Ticket has been voided";
  if (outcome === "BLOCKED") return "Ticket is not allowed for entry";
  if (outcome === "DUPLICATE_SCAN") return "Same code scanned again too quickly";
  return "Ticket not found or not valid for this organizer";
}

function normalizeDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function resolveEventContext(organizerAccessCode, selectedEventId) {
  const directEvent = await prisma.userEvent.findUnique({
    where: { accessCode: organizerAccessCode },
    select: { accessCode: true, organizerAccessCode: true },
  });
  const normalizedOrganizerAccessCode =
    directEvent?.organizerAccessCode || directEvent?.accessCode || organizerAccessCode;

  const events = await prisma.userEvent.findMany({
    where: {
      OR: [
        { organizerAccessCode: normalizedOrganizerAccessCode },
        { accessCode: normalizedOrganizerAccessCode },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      accessCode: true,
      organizerAccessCode: true,
      adminStatus: true,
    },
  });

  if (!events.length) return null;

  const selected = String(selectedEventId || "").trim()
    ? events.find((item) => item.id === String(selectedEventId || "").trim())
    : (events.find((item) => item.accessCode === organizerAccessCode) || events[0]);

  if (!selected) return null;

  return {
    organizerAccessCode: normalizedOrganizerAccessCode,
    selectedEvent: selected,
  };
}

function mapTicketSummary(ticket, event) {
  return {
    ticketPublicId: ticket.ticketPublicId,
    ticketType: ticket.ticketType || event.ticketType || null,
    ticketPrice: ticket.ticketPrice != null ? Number(ticket.ticketPrice) : null,
    attendeeName: ticket.attendeeName || null,
    attendeeEmail: ticket.attendeeEmail || null,
    attendeePhone: ticket.attendeePhone || null,
    quantity: ticket.ticketRequest?.quantity || 1,
    promoterName: ticket.promoter?.name || null,
    eventId: event.id,
    eventName: event.eventName,
    eventDate: event.eventDate,
    scannedAt: ticket.scannedAt || null,
  };
}

async function logScan({ selectedEventId, ticket, ticketPublicId, rawScannedValue, scannerSource, outcome, note = null }) {
  const scanResult = outcome === "VALID" ? "VALID" : outcome === "ALREADY_USED" ? "USED" : "INVALID";
  await prisma.scanRecord.create({
    data: {
      eventId: selectedEventId,
      ...(ticket?.id ? { ticketId: ticket.id } : {}),
      ticketPublicId,
      rawScannedValue,
      normalizedTicketPublicId: ticketPublicId,
      scannerSource,
      result: scanResult,
      ...(note ? { note } : {}),
    },
  });
}

async function scanTicket(req, res) {
  const organizerAccessCode = (req.body?.organizerAccessCode || req.body?.accessCode || "").trim();
  const selectedEventId = String(req.body?.eventId || "").trim();
  const ticketPublicId = (req.body?.ticketPublicId || "").trim();
  const rawScannedValue = sanitizeText(req.body?.rawScannedValue || ticketPublicId, LIMITS.SCAN_VALUE);
  const scannerSource = sanitizeText(req.body?.scannerSource || "manual", LIMITS.SCANNER_SOURCE) || "manual";
  const enforceEventDate = Boolean(req.body?.enforceEventDate);

  if (!organizerAccessCode || !ticketPublicId) {
    res.status(400).json({ error: "organizerAccessCode and ticketPublicId are required." });
    return;
  }

  const context = await resolveEventContext(organizerAccessCode, selectedEventId);
  if (!context) {
    res.json({
      result: "INVALID_TICKET",
      statusText: resolveScanOutcomeLabel("INVALID_TICKET"),
      supportingText: resolveSupportingText("INVALID_TICKET"),
      scannedAt: new Date(),
    });
    return;
  }

  const { selectedEvent, organizerAccessCode: normalizedOrganizerAccessCode } = context;

  const ticket = await prisma.ticket.findUnique({
    where: { ticketPublicId },
    include: {
      event: {
        select: {
          id: true,
          eventName: true,
          eventDate: true,
          ticketType: true,
          organizerAccessCode: true,
          accessCode: true,
          adminStatus: true,
        },
      },
      promoter: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      ticketRequest: {
        select: {
          id: true,
          quantity: true,
          status: true,
        },
      },
    },
  });

  let outcome = "INVALID_TICKET";
  let outcomeNote = null;
  const scannedAt = new Date();

  if (!ticket) {
    trackFailedScan(req, true);
    res.json({
      result: outcome,
      statusText: resolveScanOutcomeLabel(outcome),
      supportingText: resolveSupportingText(outcome),
      scannedAt,
    });
    return;
  }

  const ticketOrganizerAccessCode = ticket.event.organizerAccessCode || ticket.event.accessCode;
  const isCrossOrganizerTicket =
    String(ticketOrganizerAccessCode || "") !== String(normalizedOrganizerAccessCode || "");

  if (isCrossOrganizerTicket) {
    outcome = "INVALID_TICKET";
  } else if (ticket.event.id !== selectedEvent.id) {
    outcome = "WRONG_EVENT";
    outcomeNote = `Ticket event: ${ticket.event.eventName}`;
  } else if (enforceEventDate) {
    const eventDateKey = normalizeDateKey(ticket.event.eventDate);
    const currentDateKey = normalizeDateKey(scannedAt);
    if (eventDateKey && currentDateKey && eventDateKey !== currentDateKey) {
      outcome = "WRONG_DATE_SESSION";
      outcomeNote = `Ticket date: ${eventDateKey}; Scan date: ${currentDateKey}`;
    }
  }

  if (!isCrossOrganizerTicket && selectedEvent.adminStatus && selectedEvent.adminStatus !== "ACTIVE" && outcome === "INVALID_TICKET") {
    outcome = "BLOCKED";
    outcomeNote = "Event is not active";
  }

  if (!isCrossOrganizerTicket && outcome === "INVALID_TICKET" && ticket.isInvalidated) {
    if (ticket.ticketRequest?.status === "REJECTED" || ticket.ticketRequest?.status === "CANCELLED") {
      outcome = "CANCELED";
    } else {
      outcome = "BLOCKED";
    }
  }

  if (!isCrossOrganizerTicket && outcome === "INVALID_TICKET" && ticket.status === "USED") {
    outcome = "ALREADY_USED";
  }

  if (!isCrossOrganizerTicket && outcome === "INVALID_TICKET") {
    // If it reached here and ticket exists in selected event context, it's valid.
    outcome = "VALID";
  }

  if (outcome === "VALID") {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "USED", scannedAt },
    });
  }

  await logScan({
    selectedEventId: selectedEvent.id,
    ticket,
    ticketPublicId,
    rawScannedValue,
    scannerSource,
    outcome,
    note: `OUTCOME:${outcome}${outcomeNote ? ` | ${outcomeNote}` : ""}`,
  });

  trackFailedScan(req, outcome === "INVALID_TICKET");
  res.json({
    result: outcome,
    statusText: resolveScanOutcomeLabel(outcome),
    supportingText: resolveSupportingText(outcome),
    scannedAt,
    ticket: isCrossOrganizerTicket ? null : mapTicketSummary(ticket, ticket.event),
  });
}

module.exports = { scanTicket };
