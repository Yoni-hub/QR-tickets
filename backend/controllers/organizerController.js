const prisma = require("../utils/prisma");
const { getPublicBaseUrl } = require("../services/eventService");
const { sendTicketLinksDigestEmail } = require("../utils/mailer");
const { sendTicketSms } = require("../utils/sms");

const MAX_CHAT_MESSAGE_LENGTH = 1200;

function parseAccessCode(value) {
  return String(value || "").trim();
}

function parseEventId(value) {
  return String(value || "").trim();
}

function normalizeChatMessage(value) {
  return String(value || "").trim();
}

function mapChatMessage(message) {
  return {
    id: message.id,
    senderType: message.senderType,
    message: message.message,
    evidenceImageDataUrl: message.evidenceImageDataUrl || null,
    createdAt: message.createdAt,
    readAt: message.readAt || null,
  };
}

function normalizeCancellationReason(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "EVENT_CANCELLED") return "EVENT_CANCELLED";
  if (raw === "PAYMENT_REFUNDED_TO_CUSTOMER") return "PAYMENT_REFUNDED_TO_CUSTOMER";
  if (raw === "OTHER") return "OTHER";
  return "";
}

function buildCancellationMessage({ ticketPublicId, reason, otherReason, cancelledAt }) {
  const label =
    reason === "EVENT_CANCELLED"
      ? "Event cancelled"
      : reason === "PAYMENT_REFUNDED_TO_CUSTOMER"
        ? "Payment refunded to customer"
        : otherReason || "Other";
  return `Ticket ${ticketPublicId} was cancelled on ${new Date(cancelledAt).toLocaleString()}. Reason: ${label}.`;
}

async function findEventByAccessCode(accessCode, eventId = "") {
  if (!accessCode) return null;
  const directEvent = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: { id: true, accessCode: true, organizerAccessCode: true },
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
  });
  if (!events.length) return null;

  const selectedEvent = eventId
    ? events.find((item) => item.id === eventId)
    : (events.find((item) => item.accessCode === accessCode) || events[0]);
  if (!selectedEvent) return null;
  if (selectedEvent.slug) return selectedEvent;

  const fallbackSlug = `${String(selectedEvent.eventName || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50) || "event"}-${String(selectedEvent.id).slice(-6)}`;

  return prisma.userEvent.update({
    where: { id: selectedEvent.id },
    data: { slug: fallbackSlug },
  });
}

async function getOrganizerTicketRequests(req, res) {
  const accessCode = parseAccessCode(req.query?.accessCode || req.params?.accessCode);
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const requests = await prisma.ticketRequest.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      ticketType: true,
      ticketPrice: true,
      totalPrice: true,
      ticketSelections: true,
      evidenceImageDataUrl: true,
      organizerMessage: true,
      cancelledAt: true,
      cancellationReason: true,
      cancellationOtherReason: true,
      cancellationEvidenceImageDataUrl: true,
      quantity: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      promoter: { select: { id: true, name: true, code: true } },
      _count: { select: { tickets: true } },
      tickets: {
        select: {
          ticketPublicId: true,
          cancelledAt: true,
          cancellationReason: true,
          cancellationOtherReason: true,
          cancellationEvidenceImageDataUrl: true,
          deliveries: {
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { status: true },
          },
        },
      },
      messages: {
        select: {
          senderType: true,
          readAt: true,
        },
      },
    },
  });

  const items = requests.map((request) => {
    const tickets = Array.isArray(request.tickets) ? request.tickets : [];
    const latestStatuses = tickets
      .map((ticket) => ticket.deliveries?.[0]?.status || null)
      .filter(Boolean);

    let deliveryStatus = "PENDING";
    if (request.status === "APPROVED") {
      if (!latestStatuses.length) {
        deliveryStatus = "PENDING";
      } else {
        const sentCount = latestStatuses.filter((status) => status === "SENT").length;
        const failedCount = latestStatuses.filter((status) => status === "FAILED").length;
        if (sentCount === tickets.length && tickets.length > 0) deliveryStatus = "SENT";
        else if (failedCount === tickets.length && tickets.length > 0) deliveryStatus = "FAILED";
        else deliveryStatus = "PARTIAL";
      }
    } else if (request.status === "REJECTED") {
      deliveryStatus = "NOT_SENT";
    }

    const unreadClientMessages = (request.messages || []).filter(
      (message) => message.senderType === "CLIENT" && !message.readAt,
    ).length;
    const { tickets: _tickets, messages: _messages, ...requestWithoutTickets } = request;
    return {
      ...requestWithoutTickets,
      deliveryStatus,
      unreadClientMessages,
      ticketIds: tickets.map((ticket) => ticket.ticketPublicId).filter(Boolean),
      cancelledTicketIds: tickets.filter((ticket) => ticket.cancelledAt).map((ticket) => ticket.ticketPublicId),
    };
  });

  res.json({
    event: {
      id: event.id,
      eventName: event.eventName,
      slug: event.slug,
      accessCode: event.accessCode,
    },
    items,
  });
}

async function createTicketsForRequest({ event, request }) {
  const rawSelections = Array.isArray(request.ticketSelections) ? request.ticketSelections : [];
  const normalizedSelections = rawSelections.length
    ? rawSelections
      .map((item) => ({
        ticketType: String(item?.ticketType || "").trim(),
        quantity: Math.max(0, Number.parseInt(String(item?.quantity || "0"), 10) || 0),
      }))
      .filter((item) => item.ticketType && item.quantity > 0)
    : [{
      ticketType: request.ticketType || event.ticketType || "General",
      quantity: request.quantity,
    }];

  const unsoldTickets = await prisma.ticket.findMany({
    where: {
      eventId: event.id,
      ticketRequestId: null,
      isInvalidated: false,
      status: "UNUSED",
      deliveries: { none: { status: "SENT" } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, ticketPublicId: true, qrPayload: true, ticketType: true },
  });

  const usedIds = new Set();
  const assigned = [];
  for (const selection of normalizedSelections) {
    const matching = unsoldTickets.filter(
      (ticket) =>
        !usedIds.has(ticket.id) &&
        String(ticket.ticketType || event.ticketType || "General").trim() === String(selection.ticketType).trim(),
    );
    if (matching.length < selection.quantity) {
      const error = new Error(
        `Not enough ${selection.ticketType} tickets available. Requested ${selection.quantity}, available ${matching.length}. Generate more tickets.`,
      );
      error.statusCode = 400;
      throw error;
    }

    for (let index = 0; index < selection.quantity; index += 1) {
      const ticket = matching[index];
      usedIds.add(ticket.id);
      assigned.push({ ...ticket, ticketType: selection.ticketType });
    }
  }

  await prisma.$transaction(
    assigned.map((ticket) =>
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          ticketType: ticket.ticketType,
          attendeeName: request.name,
          attendeePhone: request.phone,
          attendeeEmail: request.email,
          promoterId: request.promoterId,
          ticketRequestId: request.id,
        },
      }),
    ),
  );

  return assigned;
}

async function deliverApprovedTickets({ event, request, tickets }) {
  const ticketLinks = tickets.map((ticket) => ({
    ticketType: ticket.ticketType || event.ticketType || "General",
    ticketUrl: ticket.qrPayload || `${getPublicBaseUrl()}/t/${ticket.ticketPublicId || ""}`,
  }));
  const firstTicketUrl = ticketLinks[0]?.ticketUrl || `${getPublicBaseUrl()}/t/${tickets[0]?.ticketPublicId || ""}`;

  if (request.email) {
    try {
      await sendTicketLinksDigestEmail({
        to: request.email,
        eventName: event.eventName,
        eventDate: event.eventDate,
        eventAddress: event.eventAddress,
        ticketLinks,
      });

      for (const ticket of tickets) {
        await prisma.ticketDelivery.create({
          data: {
            ticketId: ticket.id,
            email: request.email,
            method: "EMAIL_LINK",
            status: "SENT",
          },
        });
      }
    } catch (error) {
      const errorMessage = error?.message || "Email delivery failed.";
      for (const ticket of tickets) {
        await prisma.ticketDelivery.create({
          data: {
            ticketId: ticket.id,
            email: request.email,
            method: "EMAIL_LINK",
            status: "FAILED",
            errorMessage,
          },
        });
      }
    }
  }

  if (request.phone) {
    await sendTicketSms({
      to: request.phone,
      eventName: event.eventName,
      ticketUrl: firstTicketUrl,
    });
  }
}

async function approveTicketRequest(req, res) {
  const requestId = String(req.params.id || "").trim();
  const accessCode = parseAccessCode(req.body?.accessCode || req.query?.accessCode);
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "request id and accessCode are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { id: requestId, eventId: event.id },
  });

  if (!request) {
    res.status(404).json({ error: "Ticket request not found." });
    return;
  }

  if (request.status === "APPROVED") {
    res.json({ request, alreadyApproved: true });
    return;
  }

  if (request.status === "REJECTED") {
    res.status(400).json({ error: "Rejected request cannot be approved." });
    return;
  }

  let tickets;
  try {
    tickets = await createTicketsForRequest({ event, request });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Could not allocate tickets." });
    return;
  }

  const updatedRequest = await prisma.ticketRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED", organizerMessage: null },
    select: {
      id: true,
      status: true,
      quantity: true,
      ticketType: true,
      ticketPrice: true,
      totalPrice: true,
      ticketSelections: true,
      name: true,
      phone: true,
      email: true,
      promoter: { select: { name: true, code: true } },
    },
  });

  await deliverApprovedTickets({ event, request, tickets });

  res.json({
    request: updatedRequest,
    generatedTickets: tickets.map((ticket) => ({
      ticketPublicId: ticket.ticketPublicId,
      ticketUrl: ticket.qrPayload || `${getPublicBaseUrl()}/t/${ticket.ticketPublicId}`,
    })),
  });
}

async function rejectTicketRequest(req, res) {
  const requestId = String(req.params.id || "").trim();
  const accessCode = parseAccessCode(req.body?.accessCode || req.query?.accessCode);
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "request id and accessCode are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { id: requestId, eventId: event.id },
  });

  if (!request) {
    res.status(404).json({ error: "Ticket request not found." });
    return;
  }

  const updatedRequest = await prisma.ticketRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED" },
    select: { id: true, status: true, name: true, quantity: true },
  });

  res.json({ request: updatedRequest });
}

async function messageTicketRequest(req, res) {
  const requestId = String(req.params.id || "").trim();
  const accessCode = parseAccessCode(req.body?.accessCode || req.query?.accessCode);
  const organizerMessage = String(req.body?.message || "").trim();
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "request id and accessCode are required." });
    return;
  }
  if (!organizerMessage) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  if (organizerMessage.length > 1200) {
    res.status(400).json({ error: "Message is too long." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { id: requestId, eventId: event.id },
  });
  if (!request) {
    res.status(404).json({ error: "Ticket request not found." });
    return;
  }
  if (request.status === "APPROVED") {
    res.status(400).json({ error: "Approved request cannot receive a payment message." });
    return;
  }

  const updatedRequest = await prisma.ticketRequest.update({
    where: { id: request.id },
    data: {
      status: "PENDING_PAYMENT",
      organizerMessage,
    },
    select: {
      id: true,
      status: true,
      organizerMessage: true,
      updatedAt: true,
    },
  });

  res.json({ request: updatedRequest });
}

async function getTicketRequestMessages(req, res) {
  const requestId = String(req.params.id || "").trim();
  const accessCode = parseAccessCode(req.query?.accessCode || req.body?.accessCode);
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "request id and accessCode are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { id: requestId, eventId: event.id },
    select: { id: true },
  });
  if (!request) {
    res.status(404).json({ error: "Ticket request not found." });
    return;
  }

  await prisma.ticketRequestMessage.updateMany({
    where: {
      ticketRequestId: request.id,
      senderType: "CLIENT",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  const messages = await prisma.ticketRequestMessage.findMany({
    where: { ticketRequestId: request.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
  });

  res.json({
    requestId: request.id,
    messages: messages.map(mapChatMessage),
  });
}

async function sendTicketRequestMessage(req, res) {
  const requestId = String(req.params.id || "").trim();
  const accessCode = parseAccessCode(req.body?.accessCode || req.query?.accessCode);
  const message = normalizeChatMessage(req.body?.message);
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "request id and accessCode are required." });
    return;
  }
  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Message is too long." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { id: requestId, eventId: event.id },
    select: { id: true },
  });
  if (!request) {
    res.status(404).json({ error: "Ticket request not found." });
    return;
  }

  const created = await prisma.ticketRequestMessage.create({
    data: {
      ticketRequestId: request.id,
      senderType: "ORGANIZER",
      message,
    },
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
  });

  await prisma.ticketRequest.update({
    where: { id: request.id },
    data: {
      status: "PENDING_PAYMENT",
      organizerMessage: message,
    },
  });

  res.status(201).json({ message: mapChatMessage(created) });
}

async function cancelOrganizerTicket(req, res) {
  const ticketPublicId = String(req.params.ticketPublicId || "").trim();
  const accessCode = parseAccessCode(req.body?.accessCode || req.query?.accessCode);
  const eventId = parseEventId(req.body?.eventId || req.query?.eventId);
  const cancellationReason = normalizeCancellationReason(req.body?.reason);
  const cancellationOtherReason = String(req.body?.otherReason || "").trim();
  const evidenceImageDataUrl = String(req.body?.evidenceImageDataUrl || "").trim() || null;

  if (!ticketPublicId || !accessCode || !eventId) {
    res.status(400).json({ error: "ticketPublicId, accessCode and eventId are required." });
    return;
  }
  if (!cancellationReason) {
    res.status(400).json({ error: "Valid cancellation reason is required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, eventId);
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const ticket = await prisma.ticket.findFirst({
    where: { ticketPublicId, eventId: event.id },
    select: {
      id: true,
      ticketPublicId: true,
      attendeeName: true,
      attendeeEmail: true,
      ticketRequestId: true,
      isInvalidated: true,
      cancelledAt: true,
      deliveries: {
        where: { status: "SENT" },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { method: true, email: true },
      },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }
  if (ticket.cancelledAt || ticket.isInvalidated) {
    res.status(400).json({ error: "Ticket already cancelled." });
    return;
  }

  const deliveryMethod = ticket.deliveries?.[0]?.method || (ticket.ticketRequestId ? "PUBLIC_EVENT_PAGE" : "NOT_DELIVERED");
  const isSoldTicket = deliveryMethod !== "NOT_DELIVERED";
  if (!isSoldTicket) {
    res.status(400).json({ error: "Only sold tickets can be cancelled." });
    return;
  }
  if (deliveryMethod === "PUBLIC_EVENT_PAGE" && !evidenceImageDataUrl) {
    res.status(400).json({ error: "Evidence is required for public event page ticket cancellations." });
    return;
  }

  const cancelledAt = new Date();
  const organizerMessage = buildCancellationMessage({
    ticketPublicId,
    reason: cancellationReason,
    otherReason: cancellationOtherReason,
    cancelledAt,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTicket = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        isInvalidated: true,
        invalidatedAt: cancelledAt,
        cancelledAt,
        cancellationReason,
        cancellationOtherReason: cancellationReason === "OTHER" ? cancellationOtherReason || "Other" : null,
        cancellationEvidenceImageDataUrl: evidenceImageDataUrl,
      },
      select: {
        ticketPublicId: true,
        cancelledAt: true,
        cancellationReason: true,
        cancellationOtherReason: true,
        cancellationEvidenceImageDataUrl: true,
        isInvalidated: true,
      },
    });

    let updatedRequest = null;
    let createdMessage = null;
    if (ticket.ticketRequestId) {
      updatedRequest = await tx.ticketRequest.update({
        where: { id: ticket.ticketRequestId },
        data: {
          status: "CANCELLED",
          organizerMessage,
          cancelledAt,
          cancellationReason,
          cancellationOtherReason: cancellationReason === "OTHER" ? cancellationOtherReason || "Other" : null,
          cancellationEvidenceImageDataUrl: evidenceImageDataUrl,
        },
        select: {
          id: true,
          status: true,
          organizerMessage: true,
          cancelledAt: true,
          cancellationReason: true,
          cancellationOtherReason: true,
          cancellationEvidenceImageDataUrl: true,
        },
      });

      createdMessage = await tx.ticketRequestMessage.create({
        data: {
          ticketRequestId: ticket.ticketRequestId,
          senderType: "ORGANIZER",
          message: organizerMessage,
          evidenceImageDataUrl,
        },
        select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
      });
    }

    return { ticket: updatedTicket, request: updatedRequest, message: createdMessage };
  });

  res.json({
    ticket: updated.ticket,
    request: updated.request,
    message: updated.message ? mapChatMessage(updated.message) : null,
  });
}

function normalizePromoterCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30);
}

async function listPromoters(req, res) {
  const accessCode = parseAccessCode(req.query?.accessCode || req.params?.accessCode || req.body?.accessCode);
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const promoters = await prisma.promoter.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, code: true, createdAt: true },
  });

  const promoterIds = promoters.map((promoter) => promoter.id);
  const [requests, approvedRequests, usedTickets] = promoterIds.length
    ? await Promise.all([
        prisma.ticketRequest.groupBy({
          by: ["promoterId"],
          where: { eventId: event.id, promoterId: { in: promoterIds } },
          _count: { _all: true },
        }),
        prisma.ticketRequest.groupBy({
          by: ["promoterId"],
          where: { eventId: event.id, promoterId: { in: promoterIds }, status: "APPROVED" },
          _sum: { quantity: true },
        }),
        prisma.ticket.groupBy({
          by: ["promoterId"],
          where: { eventId: event.id, promoterId: { in: promoterIds }, status: "USED" },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];

  const requestsMap = new Map(requests.map((row) => [row.promoterId, row._count._all]));
  const approvedMap = new Map(approvedRequests.map((row) => [row.promoterId, Number(row._sum.quantity || 0)]));
  const scansMap = new Map(usedTickets.map((row) => [row.promoterId, row._count._all]));

  const items = promoters.map((promoter) => ({
    ...promoter,
    link: `${getPublicBaseUrl()}/e/${event.slug}?ref=${promoter.code}`,
    requestCount: requestsMap.get(promoter.id) || 0,
    approvedTickets: approvedMap.get(promoter.id) || 0,
    scannedEntries: scansMap.get(promoter.id) || 0,
  }));

  const leaderboard = [...items]
    .sort((a, b) => b.approvedTickets - a.approvedTickets)
    .map((item) => ({ promoterId: item.id, name: item.name, ticketsSold: item.approvedTickets }));

  res.json({
    event: { id: event.id, eventName: event.eventName, slug: event.slug, accessCode: event.accessCode },
    items,
    leaderboard,
  });
}

async function createPromoter(req, res) {
  const accessCode = parseAccessCode(req.body?.accessCode);
  const name = String(req.body?.name || "").trim();
  const code = normalizePromoterCode(req.body?.code || name);

  if (!accessCode || !name || !code) {
    res.status(400).json({ error: "accessCode, name and valid code are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const promoter = await prisma.promoter.create({
    data: {
      eventId: event.id,
      name,
      code,
    },
    select: { id: true, name: true, code: true, createdAt: true },
  });

  res.status(201).json({
    promoter: {
      ...promoter,
      link: `${getPublicBaseUrl()}/e/${event.slug}?ref=${promoter.code}`,
    },
  });
}

async function updatePromoter(req, res) {
  const promoterId = String(req.params.id || "").trim();
  const accessCode = parseAccessCode(req.body?.accessCode);
  const name = String(req.body?.name || "").trim();
  const code = normalizePromoterCode(req.body?.code);

  if (!promoterId || !accessCode) {
    res.status(400).json({ error: "promoter id and accessCode are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const existing = await prisma.promoter.findFirst({ where: { id: promoterId, eventId: event.id } });
  if (!existing) {
    res.status(404).json({ error: "Promoter not found." });
    return;
  }

  const promoter = await prisma.promoter.update({
    where: { id: existing.id },
    data: {
      ...(name ? { name } : {}),
      ...(code ? { code } : {}),
    },
    select: { id: true, name: true, code: true, createdAt: true },
  });

  res.json({
    promoter: {
      ...promoter,
      link: `${getPublicBaseUrl()}/e/${event.slug}?ref=${promoter.code}`,
    },
  });
}

async function deletePromoter(req, res) {
  const promoterId = String(req.params.id || "").trim();
  const accessCode = parseAccessCode(req.body?.accessCode || req.query?.accessCode);

  if (!promoterId || !accessCode) {
    res.status(400).json({ error: "promoter id and accessCode are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const existing = await prisma.promoter.findFirst({ where: { id: promoterId, eventId: event.id } });
  if (!existing) {
    res.status(404).json({ error: "Promoter not found." });
    return;
  }

  await prisma.promoter.delete({ where: { id: existing.id } });
  res.json({ deleted: true });
}

async function createGuestAndApprove(req, res) {
  const accessCode = parseAccessCode(req.body?.accessCode);
  const name = String(req.body?.name || "").trim();
  const phone = String(req.body?.phone || "").trim() || null;
  const email = String(req.body?.email || "").trim().toLowerCase() || null;
  const quantity = Math.max(1, Number.parseInt(String(req.body?.quantity || "1"), 10) || 1);
  const promoterId = String(req.body?.promoterId || "").trim() || null;

  if (!accessCode || !name) {
    res.status(400).json({ error: "accessCode and guest name are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const request = await prisma.ticketRequest.create({
    data: {
      eventId: event.id,
      name,
      phone,
      email,
      quantity,
      promoterId,
      status: "PENDING_PAYMENT",
    },
  });

  req.params.id = request.id;
  req.body.accessCode = accessCode;
  await approveTicketRequest(req, res);
}

async function bulkGuestImport(req, res) {
  const accessCode = parseAccessCode(req.body?.accessCode);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!accessCode || !rows.length) {
    res.status(400).json({ error: "accessCode and rows are required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId || req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  let created = 0;
  let failed = 0;

  for (const row of rows) {
    const name = String(row.name || "").trim();
    if (!name) {
      failed += 1;
      continue;
    }

    const quantity = Math.max(1, Number.parseInt(String(row.tickets || row.quantity || "1"), 10) || 1);
    const email = String(row.email || "").trim().toLowerCase() || null;
    const phone = String(row.phone || "").trim() || null;
    const promoterCode = normalizePromoterCode(row.promoter || "");
    const promoter = promoterCode
      ? await prisma.promoter.findFirst({ where: { eventId: event.id, code: promoterCode } })
      : null;

    const request = await prisma.ticketRequest.create({
      data: {
        eventId: event.id,
        name,
        phone,
        email,
        quantity,
        promoterId: promoter?.id || null,
        status: "PENDING_PAYMENT",
      },
    });

    const tickets = await createTicketsForRequest({ event, request });
    await prisma.ticketRequest.update({ where: { id: request.id }, data: { status: "APPROVED" } });
    await deliverApprovedTickets({ event, request, tickets });
    created += 1;
  }

  res.json({ created, failed, totalRows: rows.length });
}

module.exports = {
  getOrganizerTicketRequests,
  approveTicketRequest,
  rejectTicketRequest,
  messageTicketRequest,
  cancelOrganizerTicket,
  getTicketRequestMessages,
  sendTicketRequestMessage,
  listPromoters,
  createPromoter,
  updatePromoter,
  deletePromoter,
  createGuestAndApprove,
  bulkGuestImport,
};

