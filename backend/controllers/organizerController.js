const { Prisma } = require("@prisma/client");
const prisma = require("../utils/prisma");
const { LIMITS, sanitizeText, safeError } = require("../utils/sanitize");
const { resolveImageUrl, uploadDataUrlToS3, isS3Configured } = require("../utils/s3");
const { getPublicBaseUrl, buildQrPayload } = require("../services/eventService");
const {
  CHAT_CONVERSATION_TYPE,
  resolveActorFromOrganizer,
  startConversationForActor,
  sendMessageForActor,
  sendSystemMessageForTicketRequest,
} = require("../services/chatService");
const {
  sendTicketApprovedEmail,
  sendTicketCancelledEmail,
} = require("../utils/mailer");
const { generateTicketPublicId } = require("../utils/ticketPublicId");

const MAX_CHAT_MESSAGE_LENGTH = 1200;

function parseAccessCode(value) {
  return String(value || "").trim();
}

function parseEventId(value) {
  return String(value || "").trim();
}

function resolveEventEndAt(event) {
  const raw = event?.eventEndDate || event?.eventDate;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
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

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildRequestRiskSignals({ request, statsForEmail, event }) {
  const signals = [];
  const totalPrice = toFiniteNumber(request.totalPrice, 0);
  const quantity = Math.max(0, toFiniteNumber(request.quantity, 0));
  const hasEvidence = Boolean(request.evidenceImageDataUrl || request.evidenceS3Key);
  const maxTicketsPerEmail = Math.max(0, toFiniteNumber(event?.maxTicketsPerEmail, 0));
  const highQuantityThreshold = maxTicketsPerEmail > 0
    ? Math.max(2, Math.ceil(maxTicketsPerEmail * 0.8))
    : 6;

  if (request.duplicateEmailWarning) {
    signals.push({
      code: "DUPLICATE_EMAIL",
      severity: "MEDIUM",
      deterministic: true,
      label: "Duplicate requester email",
      explanation: "This email already appears on another active request for this event.",
    });
  }

  if (totalPrice > 0 && !hasEvidence) {
    signals.push({
      code: "MISSING_PAYMENT_EVIDENCE",
      severity: "HIGH",
      deterministic: true,
      label: "Missing payment evidence",
      explanation: "This paid request has no uploaded payment evidence image.",
    });
  }

  if (statsForEmail?.pendingCount > 1) {
    signals.push({
      code: "MULTIPLE_PENDING_SAME_EMAIL",
      severity: "MEDIUM",
      deterministic: true,
      label: "Multiple pending requests",
      explanation: `This email currently has ${statsForEmail.pendingCount} pending requests for this event.`,
    });
  }

  if (statsForEmail?.rejectedCount > 0) {
    signals.push({
      code: "PRIOR_REJECTED_SAME_EMAIL",
      severity: "LOW",
      deterministic: true,
      label: "Prior rejected history",
      explanation: `This email has ${statsForEmail.rejectedCount} previously rejected request(s) for this event.`,
    });
  }

  if (quantity >= highQuantityThreshold) {
    signals.push({
      code: "HIGH_QUANTITY_REQUEST",
      severity: maxTicketsPerEmail > 0 ? "MEDIUM" : "LOW",
      deterministic: true,
      label: "High requested quantity",
      explanation: maxTicketsPerEmail > 0
        ? `Requested quantity (${quantity}) is near the per-email cap (${maxTicketsPerEmail}).`
        : `Requested quantity (${quantity}) is higher than common single-request volume.`,
    });
  }

  const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const riskLevel = signals.reduce((current, signal) => (
    severityOrder[signal.severity] > severityOrder[current] ? signal.severity : current
  ), "NONE");

  return { signals, riskLevel };
}

function buildRequestRecommendation({ riskSignals, riskLevel }) {
  const signalCodes = new Set((riskSignals || []).map((signal) => signal.code));
  const mediumCount = (riskSignals || []).filter((signal) => signal.severity === "MEDIUM").length;
  const hasHigh = riskLevel === "HIGH";
  const hasMissingPaymentEvidence = signalCodes.has("MISSING_PAYMENT_EVIDENCE");
  const hasDuplicateOrBurst = signalCodes.has("DUPLICATE_EMAIL") || signalCodes.has("MULTIPLE_PENDING_SAME_EMAIL");

  // Conservative reject criteria: missing paid evidence plus corroborating duplicate/burst pattern.
  if (hasHigh && hasMissingPaymentEvidence && hasDuplicateOrBurst) {
    return {
      action: "REJECT",
      explanation: "Paid request has missing evidence and repeated requester pattern; rejecting is recommended unless manual proof is verified.",
      deterministic: true,
      basedOnSignals: ["MISSING_PAYMENT_EVIDENCE", ...(hasDuplicateOrBurst ? ["DUPLICATE_EMAIL_OR_MULTIPLE_PENDING"] : [])],
    };
  }

  if (hasHigh || mediumCount > 0) {
    return {
      action: "REVIEW",
      explanation: "Risk signals need manual verification before approving this request.",
      deterministic: true,
      basedOnSignals: Array.from(signalCodes),
    };
  }

  // Low/no-signal requests default to approve recommendation (manual action still required).
  const hasOnlyLowSignals = (riskSignals || []).length > 0 && (riskSignals || []).every((signal) => signal.severity === "LOW");
  if (riskLevel === "NONE" || hasOnlyLowSignals) {
    return {
      action: "APPROVE",
      explanation: "No major risk signals detected for this request.",
      deterministic: true,
      basedOnSignals: Array.from(signalCodes),
    };
  }

  return {
    action: "REVIEW",
    explanation: "Mixed signals detected; manual review is recommended.",
    deterministic: true,
    basedOnSignals: Array.from(signalCodes),
  };
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
      evidenceS3Key: true,
      organizerMessage: true,
      cancelledAt: true,
      cancellationReason: true,
      cancellationOtherReason: true,
      cancellationEvidenceImageDataUrl: true,
      cancellationEvidenceS3Key: true,
      quantity: true,
      emailVerified: true,
      duplicateEmailWarning: true,
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

  const requestStatsByEmail = new Map();
  for (const request of requests) {
    const key = normalizeEmail(request.email);
    if (!key) continue;
    const stats = requestStatsByEmail.get(key) || {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      cancelledCount: 0,
    };
    if (request.status === "PENDING_VERIFICATION") stats.pendingCount += 1;
    else if (request.status === "APPROVED") stats.approvedCount += 1;
    else if (request.status === "REJECTED") stats.rejectedCount += 1;
    else if (request.status === "CANCELLED") stats.cancelledCount += 1;
    requestStatsByEmail.set(key, stats);
  }

  const items = await Promise.all(requests.map(async (request) => {
    const tickets = Array.isArray(request.tickets) ? request.tickets : [];
    const latestStatuses = tickets
      .map((ticket) => ticket.deliveries?.[0]?.status || null)
      .filter(Boolean);

    let deliveryStatus = "PENDING";
    if (request.status === "APPROVED") {
      if (!latestStatuses.length) {
        deliveryStatus = "CLIENT DASHBOARD";
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

    // Resolve evidence URLs (presigned S3 URL for new records, data URL for old records)
    const [evidenceImageDataUrl, cancellationEvidenceImageDataUrl] = await Promise.all([
      resolveImageUrl(request.evidenceS3Key, request.evidenceImageDataUrl),
      resolveImageUrl(request.cancellationEvidenceS3Key, request.cancellationEvidenceImageDataUrl),
    ]);

    const { signals: riskSignals, riskLevel } = buildRequestRiskSignals({
      request,
      statsForEmail: requestStatsByEmail.get(normalizeEmail(request.email)) || null,
      event,
    });
    const recommendation = buildRequestRecommendation({ riskSignals, riskLevel });

    const { tickets: _tickets, messages: _messages, evidenceS3Key: _esk, cancellationEvidenceS3Key: _cesk, ...requestWithoutTickets } = request;
    return {
      ...requestWithoutTickets,
      evidenceImageDataUrl,
      cancellationEvidenceImageDataUrl,
      riskSignals,
      riskLevel,
      recommendation,
      deliveryStatus,
      unreadClientMessages,
      ticketIds: tickets.map((ticket) => ticket.ticketPublicId).filter(Boolean),
      cancelledTicketIds: tickets.filter((ticket) => ticket.cancelledAt).map((ticket) => ticket.ticketPublicId),
    };
  }));

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

async function createTicketsForRequest({ event, request }, tx = null) {
  const db = tx || prisma;

  // Build selections from request or fall back to event's current ticket definition
  const rawSelections = Array.isArray(request.ticketSelections) ? request.ticketSelections : [];
  const normalizedSelections = rawSelections.length
    ? rawSelections
        .map((item) => ({
          ticketType: String(item?.ticketType || "").trim(),
          ticketPrice: item?.ticketPrice != null ? Number(item.ticketPrice) : (item?.unitPrice != null ? Number(item.unitPrice) : null),
          quantity: Math.max(0, Number.parseInt(String(item?.quantity || "0"), 10) || 0),
        }))
        .filter((item) => item.ticketType && item.quantity > 0)
    : [{
        ticketType: request.ticketType || event.ticketType || "General",
        ticketPrice: request.ticketPrice != null ? Number(request.ticketPrice) : (event.ticketPrice != null ? Number(event.ticketPrice) : null),
        quantity: request.quantity,
      }];

  // Derive designJson template from event (carries currency, styling, etc.)
  const eventDesignJson = event.designJson && typeof event.designJson === "object" ? event.designJson : {};
  const currency = String(eventDesignJson.currency || "$").trim();

  // Generate unique public IDs (collision-safe within this batch)
  const existingIds = new Set();
  const created = [];

  for (const selection of normalizedSelections) {
    for (let i = 0; i < selection.quantity; i++) {
      let ticketPublicId = generateTicketPublicId();
      while (existingIds.has(ticketPublicId)) {
        ticketPublicId = generateTicketPublicId();
      }
      existingIds.add(ticketPublicId);

      const price = selection.ticketPrice;
      const priceText = price != null && Number.isFinite(price) && price > 0
        ? `${currency}${price.toFixed(2)}`
        : "Free";

      const ticketDesignJson = {
        ...eventDesignJson,
        ticketTypeLabel: String(selection.ticketType).toUpperCase(),
        priceText,
      };

      const ticket = await db.ticket.create({
        data: {
          eventId: event.id,
          ticketPublicId,
          qrPayload: buildQrPayload(ticketPublicId),
          status: "UNUSED",
          ticketType: selection.ticketType,
          ticketPrice: price,
          designJson: ticketDesignJson,
          attendeeName: request.name,
          attendeePhone: request.phone || null,
          attendeeEmail: request.email || null,
          promoterId: request.promoterId || null,
          ticketRequestId: request.id,
        },
        select: { id: true, ticketPublicId: true, qrPayload: true, ticketType: true },
      });

      created.push(ticket);
    }
  }

  return created;
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

  const eventEndAt = resolveEventEndAt(event);
  if (eventEndAt && new Date() >= eventEndAt) {
    res.status(403).json({ error: "This event has ended. Ticket requests can no longer be approved." });
    return;
  }

  let approvalResult;
  try {
    approvalResult = await prisma.$transaction(async (tx) => {
      // Re-check status inside transaction to prevent race condition
      const fresh = await tx.ticketRequest.findFirst({ where: { id: request.id }, select: { status: true } });
      if (fresh?.status === "APPROVED") return { alreadyApproved: true };
      if (fresh?.status === "REJECTED") throw Object.assign(new Error("Rejected request cannot be approved."), { statusCode: 400 });
      const tickets = await createTicketsForRequest({ event, request }, tx);
      const updatedRequest = await tx.ticketRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", organizerMessage: null },
        select: {
          id: true, status: true, quantity: true, ticketType: true, ticketPrice: true,
          totalPrice: true, ticketSelections: true, name: true, email: true,
          clientProfile: { select: { clientAccessToken: true } }, promoter: { select: { name: true, code: true } },
        },
      });
      return { alreadyApproved: false, tickets, updatedRequest };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error?.code === "P2034") {
      res.status(409).json({ error: "Request is being processed concurrently. Please try again." });
      return;
    }
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not allocate tickets.") });
    return;
  }

  if (approvalResult.alreadyApproved) {
    res.json({ request, alreadyApproved: true });
    return;
  }

  const { tickets, updatedRequest } = approvalResult;

  // Send system message to chat + email notification (tracked)
  sendSystemMessageForTicketRequest({
    ticketRequestId: request.id,
    body: `Your ticket request has been approved. ${tickets.length} ticket(s) are ready in your dashboard.`,
    emailFn: sendTicketApprovedEmail,
    emailArgs: {
      eventDate: event.eventDate,
      eventAddress: event.eventAddress,
    },
  }).catch(() => {});

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

  sendSystemMessageForTicketRequest({
    ticketRequestId: request.id,
    body: "Your ticket request has been rejected by the organizer. Please contact the organizer for more details.",
    emailFn: null,
  }).catch(() => {});

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
      status: "PENDING_VERIFICATION",
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
      status: "PENDING_VERIFICATION",
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
  const cancellationOtherReason = sanitizeText(req.body?.otherReason, LIMITS.CANCELLATION_REASON);
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
    res.status(400).json({ error: "Refund evidence is required." });
    return;
  }

  // Upload cancellation evidence to S3 if configured
  let cancellationEvidenceS3Key = null;
  let cancellationEvidenceDataUrl = evidenceImageDataUrl || null;
  if (evidenceImageDataUrl && isS3Configured()) {
    cancellationEvidenceS3Key = await uploadDataUrlToS3(evidenceImageDataUrl, "cancellation-evidence");
    cancellationEvidenceDataUrl = null;
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
        cancellationEvidenceImageDataUrl: cancellationEvidenceDataUrl,
        cancellationEvidenceS3Key,
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
    if (ticket.ticketRequestId) {
      updatedRequest = await tx.ticketRequest.update({
        where: { id: ticket.ticketRequestId },
        data: {
          status: "CANCELLED",
          organizerMessage,
          cancelledAt,
          cancellationReason,
          cancellationOtherReason: cancellationReason === "OTHER" ? cancellationOtherReason || "Other" : null,
          cancellationEvidenceImageDataUrl: cancellationEvidenceDataUrl,
          cancellationEvidenceS3Key,
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
    }

    return { ticket: updatedTicket, request: updatedRequest };
  });

  let chatMessage = null;
  if (ticket.ticketRequestId) {
    chatMessage = await sendSystemMessageForTicketRequest({
      ticketRequestId: ticket.ticketRequestId,
      body: organizerMessage,
      emailFn: sendTicketCancelledEmail,
      evidenceDataUrl: cancellationEvidenceDataUrl || null,
      evidenceS3Key: cancellationEvidenceS3Key || null,
    });
  }

  res.json({
    ticket: updated.ticket,
    request: updated.request,
    message: chatMessage || null,
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
  const name = sanitizeText(req.body?.name, LIMITS.NAME);
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


async function getEventAutoApprove(req, res) {
  const accessCode = parseAccessCode(req.params?.accessCode || req.query?.accessCode);
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }
  const event = await findEventByAccessCode(accessCode, parseEventId(req.query?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  res.json({ autoApprove: event.autoApprove ?? false });
}

async function setEventAutoApprove(req, res) {
  const accessCode = parseAccessCode(req.params?.accessCode || req.body?.accessCode);
  const autoApprove = req.body?.autoApprove === true || req.body?.autoApprove === "true";
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }
  const event = await findEventByAccessCode(accessCode, parseEventId(req.body?.eventId));
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  await prisma.userEvent.update({
    where: { id: event.id },
    data: { autoApprove },
  });
  res.json({ autoApprove });
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
  getEventAutoApprove,
  setEventAutoApprove,
  createTicketsForRequest,
};
