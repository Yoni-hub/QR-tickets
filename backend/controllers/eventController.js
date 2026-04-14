const crypto = require("crypto");
const prisma = require("../utils/prisma");
const { generateAccessCode } = require("../utils/accessCode");
const { LIMITS, sanitizeText, safeError } = require("../utils/sanitize");
const { createEvent, buildQrPayload, getPublicBaseUrl } = require("../services/eventService");
const {
  isOrganizerBlockedFromNewEvents,
  BLOCK_NEW_EVENT_MESSAGE,
  submitInvoicePaymentEvidenceForOrganizer,
  listInvoicePaymentEvidence,
} = require("../services/organizerInvoiceService");
const { generateTicketPublicId } = require("../utils/ticketPublicId");
const { checkDailyTicketCap } = require("../utils/dailyCaps");
const { verifyTurnstile } = require("../utils/turnstile");
const { sendOtpEmail, sendOrganizerRecoveryEmail, sendOrganizerBillingUpdateEmail, sendAdminInvoiceEvidenceSubmittedEmail } = require("../utils/mailer");
const {
  DEFAULT_TICKET_TYPE,
  reservePendingTicketIds,
} = require("../services/pendingTicketReservations");
const logger = require("../utils/logger");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTIF_OTP_SLUG = "__organizer_notif__";
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;

function buildSoldTicketWhere(eventId) {
  return {
    eventId,
    OR: [
      { ticketRequestId: { not: null } },
      { status: "USED" },
    ],
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

async function generateEventSlug(eventName, currentEventId = "") {
  const base = slugify(eventName) || "event";
  let slug = base;
  let index = 2;
  while (true) {
    const existing = await prisma.userEvent.findUnique({ where: { slug } });
    if (!existing || existing.id === currentEventId) return slug;
    slug = `${base}-${index}`;
    index += 1;
  }
}

function toEventListItem(event) {
  return {
    id: event.id,
    slug: event.slug,
    organizerName: event.organizerName,
    eventName: event.eventName,
    eventDate: event.eventDate,
    eventEndDate: event.eventEndDate,
    eventAddress: event.eventAddress,
    accessCode: event.accessCode,
    createdAt: event.createdAt,
    salesCutoffAt: event.salesCutoffAt,
    salesWindowStart: event.salesWindowStart,
    salesWindowEnd: event.salesWindowEnd,
    maxTicketsPerEmail: event.maxTicketsPerEmail,
  };
}

function formatTicketTypeBreakdown(rows = []) {
  const parts = rows
    .map((row) => {
      const type = String(row?.ticketType || "").trim() || "General";
      const normalizedType = type.toLowerCase() === "general" ? "General admission" : type;
      const count = Number(row?._count?._all || 0);
      if (count < 1) return null;
      return `${count}x ${normalizedType}`;
    })
    .filter(Boolean);
  return parts.join(", ");
}

async function buildInvoiceTicketTypeBreakdown(eventId) {
  const where = {
    eventId,
    cancelledAt: null,
    ticketRequestId: { not: null },
    ticketRequest: { status: "APPROVED" },
  };
  const rows = await prisma.ticket.groupBy({
    by: ["ticketType"],
    where,
    _count: { _all: true },
  });
  return formatTicketTypeBreakdown(rows);
}

async function resolveEventGroupByAccessCode(accessCode) {
  if (!accessCode) return null;
  const direct = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: { id: true, accessCode: true, organizerAccessCode: true },
  });
  const organizerAccessCode = direct?.organizerAccessCode || direct?.accessCode || accessCode;

  const groupEvents = await prisma.userEvent.findMany({
    where: {
      OR: [
        { organizerAccessCode },
        { accessCode: organizerAccessCode },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      organizerName: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
      eventAddress: true,
      accessCode: true,
      organizerAccessCode: true,
      ticketType: true,
      ticketPrice: true,
      paymentInstructions: true,
      isDemo: true,
      quantity: true,
      createdAt: true,
      designJson: true,
      salesCutoffAt: true,
      salesWindowStart: true,
      salesWindowEnd: true,
      maxTicketsPerEmail: true,
      emailVerified: true,
      organizerEmail: true,
      notifyOnRequest: true,
      notifyOnMessage: true,
      invoiceEvidenceAutoApprove: true,
      scannerLocked: true,
    },
  });

  if (!groupEvents.length) return null;

  const normalized = groupEvents.map((event) => ({
    ...event,
    organizerAccessCode: event.organizerAccessCode || organizerAccessCode,
  }));
  return {
    organizerAccessCode,
    events: normalized,
  };
}

function resolveSelectedEvent(group, requestedEventId) {
  if (!group?.events?.length) return null;
  const requested = String(requestedEventId || "").trim();
  if (requested) {
    const match = group.events.find((event) => event.id === requested);
    if (match) return match;
  }
  return group.events[0];
}


function normalizePriceText(value, currency = "$") {
  const sym = String(currency || "$").trim();
  if (value == null) return "Free";
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return `${sym}${parsed.toFixed(2)}`;
  if (Number.isFinite(parsed) && parsed === 0) return "Free";
  const raw = String(value || "").trim();
  return raw || "Free";
}

function resolveTicketGroupsFromDesign(designJson) {
  if (!designJson || typeof designJson !== "object") return [];
  const rawGroups = Array.isArray(designJson.ticketGroups) ? designJson.ticketGroups : [];
  return rawGroups
    .map((group, index) => {
      const ticketType = String(group?.ticketType || "").trim() || `Type ${index + 1}`;
      const ticketPriceRaw = String(group?.ticketPrice ?? "").trim();
      const parsedPrice = ticketPriceRaw === "" ? null : Number(ticketPriceRaw);
      const ticketPrice = Number.isFinite(parsedPrice) ? parsedPrice : null;
      return {
        ticketType,
        ticketPrice,
        groupDesign: {
          ...designJson,
          ticketTypeLabel: ticketType.toUpperCase(),
          priceText: normalizePriceText(ticketPrice, designJson?.currency),
          headerImageDataUrl: group?.headerImageDataUrl || null,
          headerOverlay: Number(group?.headerOverlay ?? designJson?.headerOverlay ?? 0.25),
          headerTextColorMode: String(group?.headerTextColorMode || designJson?.headerTextColorMode || "AUTO"),
        },
      };
    })
    .filter((group) => group.ticketType);
}


async function createLiveEvent(req, res) {
  const captchaOk = await verifyTurnstile(req.body?.cfTurnstileToken, req.ip);
  if (!captchaOk) {
    res.status(403).json({ error: "CAPTCHA verification failed. Please try again." });
    return;
  }
  try {
    const data = await createEvent(req.body || {}, false);
    res.status(201).json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Failed to create event.") });
  }
}

async function createDemoEvent(req, res) {
  const captchaOk = await verifyTurnstile(req.body?.cfTurnstileToken, req.ip);
  if (!captchaOk) {
    res.status(403).json({ error: "CAPTCHA verification failed. Please try again." });
    return;
  }
  try {
    const data = await createEvent(req.body || {}, true);
    res.status(201).json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Failed to create demo event.") });
  }
}

async function getEventByCode(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const group = await resolveEventGroupByAccessCode(accessCode);
  if (!group) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  const event = resolveSelectedEvent(group, req.query?.eventId);
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const totalTickets = await prisma.ticket.count({ where: { eventId: event.id } });
  const scannedTickets = await prisma.ticket.count({ where: { eventId: event.id, status: "USED" } });
  const soldTickets = await prisma.ticket.count({ where: buildSoldTicketWhere(event.id) });

  const requestedInvoiceId = String(req.query?.invoiceId || "").trim();
  const [scans, latestInvoice, organizerInvoicesRaw] = await Promise.all([
    prisma.scanRecord.findMany({
      where: { eventId: event.id },
      orderBy: { scannedAt: "desc" },
      take: 100,
      select: { ticketPublicId: true, result: true, scannedAt: true },
    }),
    requestedInvoiceId
      ? prisma.organizerInvoice.findFirst({
          where: { id: requestedInvoiceId, eventId: event.id },
          select: {
            id: true,
            invoiceType: true,
            status: true,
            currencySnapshot: true,
            totalAmount: true,
            amountPaid: true,
            dueAt: true,
            generatedAt: true,
          },
        })
      : prisma.organizerInvoice.findFirst({
          where: { eventId: event.id, invoiceType: "POST_EVENT_FINAL" },
          orderBy: { generatedAt: "desc" },
          select: {
            id: true,
            invoiceType: true,
            status: true,
            currencySnapshot: true,
            totalAmount: true,
            amountPaid: true,
            dueAt: true,
            generatedAt: true,
          },
        }),
    prisma.organizerInvoice.findMany({
      where: { eventId: event.id, invoiceType: "POST_EVENT_FINAL" },
      orderBy: { generatedAt: "asc" },
      select: {
        id: true,
        invoiceType: true,
        status: true,
        currencySnapshot: true,
        approvedTicketCountSnapshot: true,
        unitPriceSnapshot: true,
        totalAmount: true,
        amountPaid: true,
        paymentInstructionSnapshot: true,
        dueAt: true,
        generatedAt: true,
        evidenceUploadAllowance: true,
        paymentEvidence: {
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: {
            id: true,
            evidenceImageDataUrl: true,
            status: true,
            submittedAt: true,
          },
        },
      },
    }),
  ]);
  const organizerInvoices = await Promise.all(
    organizerInvoicesRaw.map(async (invoice) => ({
      id: invoice.id,
      invoiceType: invoice.invoiceType,
      status: invoice.status,
      currency: invoice.currencySnapshot,
      approvedTicketCount: Number(invoice.approvedTicketCountSnapshot || 0),
      ticketTypeBreakdown: await buildInvoiceTicketTypeBreakdown(event.id),
      unitPrice: Number(invoice.unitPriceSnapshot || 0),
      totalAmount: Number(invoice.totalAmount || 0),
      amountPaid: Number(invoice.amountPaid || 0),
      amountRemaining: Number(invoice.totalAmount || 0) - Number(invoice.amountPaid || 0),
      paymentInstruction: String(invoice.paymentInstructionSnapshot || "").trim(),
      canUploadEvidence: Number(invoice.evidenceUploadAllowance || 0) > 0,
      lastEvidenceImageDataUrl: String(invoice.paymentEvidence?.[0]?.evidenceImageDataUrl || "").trim() || null,
      lastEvidenceStatus: invoice.paymentEvidence?.[0]?.status || null,
      lastEvidenceSubmittedAt: invoice.paymentEvidence?.[0]?.submittedAt || null,
      dueAt: invoice.dueAt,
      generatedAt: invoice.generatedAt,
    })),
  );
  const billingWarnings = [];

  res.json({
    organizerAccessCode: group.organizerAccessCode,
    events: group.events.map(toEventListItem),
    selectedEventId: event.id,
    event,
    totalTickets,
    scannedTickets,
    remainingTickets: Math.max(0, totalTickets - soldTickets),
    scans,
    latestInvoice: latestInvoice
      ? {
          id: latestInvoice.id,
          invoiceType: latestInvoice.invoiceType,
          status: latestInvoice.status,
          currency: latestInvoice.currencySnapshot,
          totalAmount: latestInvoice.totalAmount,
          amountPaid: latestInvoice.amountPaid,
          amountRemaining: Number(latestInvoice.totalAmount) - Number(latestInvoice.amountPaid || 0),
          dueAt: latestInvoice.dueAt,
          generatedAt: latestInvoice.generatedAt,
        }
      : null,
    organizerInvoices,
    invoiceEvidenceAutoApprove: Boolean(event.invoiceEvidenceAutoApprove),
    billingWarnings,
  });
}

async function getEventTickets(req, res) {
  const eventId = (req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }

  const [event, rawTickets, pendingRequests] = await Promise.all([
    prisma.userEvent.findUnique({
      where: { id: eventId },
      select: { id: true, ticketType: true },
    }),
    prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ticketPublicId: true,
        status: true,
        scannedAt: true,
        qrPayload: true,
        ticketType: true,
        ticketPrice: true,
        attendeeName: true,
        attendeeEmail: true,
        ticketRequestId: true,
        isInvalidated: true,
        invalidatedAt: true,
        cancelledAt: true,
        cancellationReason: true,
        cancellationOtherReason: true,
        cancellationEvidenceImageDataUrl: true,
        deliveries: {
          where: { status: "SENT" },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { method: true, sentAt: true, email: true },
        },
      },
    }),
    prisma.ticketRequest.findMany({
      where: { eventId, status: "PENDING_VERIFICATION" },
      orderBy: { createdAt: "asc" },
      select: { ticketType: true, quantity: true, ticketSelections: true },
    }),
  ]);
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const tickets = rawTickets.map((ticket) => ({
    ...ticket,
    deliveryMethod: ticket.deliveries?.[0]?.method || (ticket.ticketRequestId ? "PUBLIC_EVENT_PAGE" : "NOT_DELIVERED"),
    deliveredAt: ticket.deliveries?.[0]?.sentAt || null,
    deliveredTo: ticket.deliveries?.[0]?.email || null,
    buyer:
      String(ticket.attendeeName || "").trim() ||
      String(ticket.attendeeEmail || "").trim() ||
      String(ticket.deliveries?.[0]?.email || "").trim() ||
      "",
  }));

  const undeliveredPool = tickets.filter(
    (ticket) =>
      !ticket.ticketRequestId &&
      ticket.status === "UNUSED" &&
      !ticket.isInvalidated &&
      ticket.deliveryMethod === "NOT_DELIVERED",
  );
  const reservedPendingTicketIds = reservePendingTicketIds({
    availableTickets: undeliveredPool,
    pendingRequests,
    fallbackTicketType: event.ticketType || DEFAULT_TICKET_TYPE,
  });

  res.json({
    eventId,
    tickets,
    summary: {
      undeliveredTickets: undeliveredPool.length,
      pendingRequestedTickets: reservedPendingTicketIds.size,
      downloadableTickets: Math.max(0, undeliveredPool.length - reservedPendingTicketIds.size),
    },
  });
}

async function generateTicketsByAccessCode(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const group = await resolveEventGroupByAccessCode(accessCode);
  if (!group) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  const event = resolveSelectedEvent(group, req.body?.eventId || req.query?.eventId);
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const eventName = sanitizeText(req.body?.eventName, LIMITS.EVENT_NAME);
  const organizerName = sanitizeText(req.body?.organizerName, LIMITS.NAME);
  const eventAddress = sanitizeText(req.body?.eventAddress, LIMITS.EVENT_ADDRESS);
  const rawEventDate = String(req.body?.eventDateTime || req.body?.dateTimeText || "").trim();
  const parsedEventDate = rawEventDate ? new Date(rawEventDate) : null;
  if (parsedEventDate && !Number.isNaN(parsedEventDate.getTime()) && parsedEventDate <= new Date()) {
    res.status(400).json({ error: "Event start date must be in the future." });
    return;
  }
  const designJson = req.body?.designJson && typeof req.body.designJson === "object" ? req.body.designJson : null;
  const currency = String(req.body?.currency || designJson?.currency || "$").trim() || "$";
  const designGroups = Array.isArray(designJson?.ticketGroups) ? designJson.ticketGroups : [];
  const bodySelections = Array.isArray(req.body?.ticketSelections) ? req.body.ticketSelections : [];

  const fallbackQuantity = Math.max(0, Number.parseInt(String(req.body?.quantity || "0"), 10) || 0);
  const fallbackType = sanitizeText(req.body?.ticketType, LIMITS.TICKET_TYPE);
  const fallbackPriceRaw = String(req.body?.ticketPrice || "").trim();

  const sourceGroups = designGroups.length
    ? designGroups
    : bodySelections.length
      ? bodySelections
      : [{
          ticketType: fallbackType || "General",
          ticketPrice: fallbackPriceRaw,
          quantity: String(fallbackQuantity),
        }];

  const normalizedGroups = sourceGroups
    .map((group, index) => {
      const quantity = Math.max(0, Number.parseInt(String(group?.quantity || "0"), 10) || 0);
      const ticketType = String(group?.ticketType || "").trim() || `Type ${index + 1}`;
      const ticketPriceRaw = String(group?.ticketPrice ?? "").trim();
      const parsedPrice = ticketPriceRaw === "" ? null : Number(ticketPriceRaw);
      const ticketPrice = Number.isFinite(parsedPrice) ? parsedPrice : null;
      const currencySymbol = currency;
      const resolvedPriceText = ticketPriceRaw
        ? Number.isFinite(parsedPrice) && parsedPrice > 0
          ? `${currencySymbol}${parsedPrice.toFixed(2)}`
          : ticketPriceRaw
        : "Free";
      return {
        quantity,
        ticketType,
        ticketPrice,
        groupDesign: {
          ...(designJson && typeof designJson === "object" ? designJson : {}),
          ticketTypeLabel: ticketType.toUpperCase(),
          priceText: resolvedPriceText,
          headerImageDataUrl: group?.headerImageDataUrl || null,
          headerOverlay: Number(group?.headerOverlay ?? 0.25),
          headerTextColorMode: String(group?.headerTextColorMode || "AUTO"),
        },
      };
    })
    .filter((group) => group.quantity > 0);

  if (!normalizedGroups.length) {
    res.status(400).json({ error: "Set quantity to 1 or more before generating tickets." });
    return;
  }

  const totalRequested = normalizedGroups.reduce((sum, g) => sum + g.quantity, 0);
  try {
    await checkDailyTicketCap(totalRequested);
  } catch (capError) {
    res.status(429).json({ error: capError.message });
    return;
  }

  const ids = new Set();
  const rows = [];
  for (const group of normalizedGroups) {
    for (let index = 0; index < group.quantity; index += 1) {
      let ticketPublicId = generateTicketPublicId();
      while (ids.has(ticketPublicId)) {
        ticketPublicId = generateTicketPublicId();
      }
      ids.add(ticketPublicId);
      rows.push({
        eventId: event.id,
        ticketPublicId,
        qrPayload: buildQrPayload(ticketPublicId),
        status: "UNUSED",
        ticketType: group.ticketType,
        ticketPrice: group.ticketPrice,
        designJson: group.groupDesign,
      });
    }
  }

  const createdCount = rows.length;
  await prisma.ticket.createMany({ data: rows });

  const primaryGroup = normalizedGroups[0];
  await prisma.userEvent.update({
    where: { id: event.id },
    data: {
      quantity: (event.quantity || 0) + createdCount,
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, "organizerName") ? { organizerName: organizerName || null } : {}),
      ...(eventName ? { eventName } : {}),
      ...(eventAddress ? { eventAddress } : {}),
      ...(parsedEventDate && !Number.isNaN(parsedEventDate.getTime()) ? { eventDate: parsedEventDate } : {}),
      ...(primaryGroup?.ticketType ? { ticketType: primaryGroup.ticketType } : {}),
      ...(primaryGroup && primaryGroup.ticketPrice != null ? { ticketPrice: primaryGroup.ticketPrice } : {}),
      ...(designJson ? { designJson } : { designJson: { currency } }),
      organizerAccessCode: event.organizerAccessCode || group.organizerAccessCode,
    },
  });

  res.status(201).json({
    created: createdCount,
    eventId: event.id,
    accessCode: event.accessCode,
  });
}

async function updateEventInline(req, res) {
  const eventId = (req.params.eventId || "").trim();
  const accessCode = (req.body?.accessCode || "").trim();
  if (!eventId || !accessCode) {
    res.status(400).json({ error: "eventId and accessCode are required." });
    return;
  }

  const existing = await prisma.userEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      accessCode: true,
      organizerAccessCode: true,
      organizerName: true,
      organizerEmail: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
      eventAddress: true,
      paymentInstructions: true,
      ticketType: true,
      ticketPrice: true,
      designJson: true,
      salesCutoffAt: true,
      salesWindowStart: true,
      salesWindowEnd: true,
      maxTicketsPerEmail: true,
      createdAt: true,
    },
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  const authorizedCodes = new Set([existing.accessCode, existing.organizerAccessCode].filter(Boolean));
  if (!authorizedCodes.has(accessCode)) {
    res.status(403).json({ error: "Invalid access code for this event." });
    return;
  }

  const now = new Date();
  const eventEndAt = existing.eventEndDate || existing.eventDate;
  if (eventEndAt && now >= new Date(eventEndAt)) {
    res.status(400).json({ error: "This event has ended. Event details can no longer be changed." });
    return;
  }

  const soldTicketsCount = await prisma.ticket.count({ where: buildSoldTicketWhere(eventId) });
  const hasSoldTickets = soldTicketsCount > 0;


  const eventName = sanitizeText(req.body?.eventName, LIMITS.EVENT_NAME);
  const organizerName = sanitizeText(req.body?.organizerName, LIMITS.NAME);
  const eventAddress = sanitizeText(req.body?.eventAddress, LIMITS.EVENT_ADDRESS);
  const paymentInstructions = sanitizeText(req.body?.paymentInstructions, LIMITS.PAYMENT_INSTRUCTIONS);
  const eventDateRaw = String(req.body?.eventDate || "").trim();
  const parsedEventDate = eventDateRaw ? new Date(eventDateRaw) : null;
  const eventEndDateRaw = String(req.body?.eventEndDate || "").trim();
  const parsedEventEndDate = eventEndDateRaw ? new Date(eventEndDateRaw) : null;
  const hasEventEndDate = Object.prototype.hasOwnProperty.call(req.body || {}, "eventEndDate");
  const ticketType = sanitizeText(req.body?.ticketType, LIMITS.TICKET_TYPE);
  const hasTicketPrice = Object.prototype.hasOwnProperty.call(req.body || {}, "ticketPrice");
  const ticketPriceRaw = String(req.body?.ticketPrice ?? "").trim();
  const parsedTicketPrice = ticketPriceRaw === "" ? null : Number(ticketPriceRaw);
  const hasDesignJson =
    Object.prototype.hasOwnProperty.call(req.body || {}, "designJson") &&
    req.body?.designJson &&
    typeof req.body.designJson === "object";
  const incomingDesignJson = hasDesignJson ? req.body.designJson : null;
  const existingCurrency = String(existing?.designJson?.currency || "$").trim() || "$";
  const incomingCurrency = String(req.body?.currency || incomingDesignJson?.currency || existingCurrency).trim() || existingCurrency;
  const salesCutoffRaw = String(req.body?.salesCutoffAt || "").trim();
  const parsedSalesCutoff = salesCutoffRaw ? new Date(salesCutoffRaw) : null;
  const hasSalesCutoff = Object.prototype.hasOwnProperty.call(req.body || {}, "salesCutoffAt");
  const salesWindowStart = Object.prototype.hasOwnProperty.call(req.body || {}, "salesWindowStart")
    ? (String(req.body.salesWindowStart || "").trim() || null) : undefined;
  const salesWindowEnd = Object.prototype.hasOwnProperty.call(req.body || {}, "salesWindowEnd")
    ? (String(req.body.salesWindowEnd || "").trim() || null) : undefined;
  const hasMaxTickets = Object.prototype.hasOwnProperty.call(req.body || {}, "maxTicketsPerEmail");
  const maxTicketsPerEmailRaw = hasMaxTickets ? String(req.body.maxTicketsPerEmail ?? "").trim() : undefined;
  const maxTicketsPerEmail = maxTicketsPerEmailRaw === "" || maxTicketsPerEmailRaw === undefined
    ? (hasMaxTickets ? null : undefined)
    : (Number.isInteger(Number(maxTicketsPerEmailRaw)) && Number(maxTicketsPerEmailRaw) > 0 ? Number(maxTicketsPerEmailRaw) : undefined);

  if (eventDateRaw && Number.isNaN(parsedEventDate?.getTime())) {
    res.status(400).json({ error: "Invalid eventDate." });
    return;
  }
  if (eventEndDateRaw && Number.isNaN(parsedEventEndDate?.getTime())) {
    res.status(400).json({ error: "Invalid eventEndDate." });
    return;
  }
  // Allow sending existing eventDate back even if the event has started (frontend sends full payload).
  if (parsedEventDate && parsedEventDate <= now && parsedEventDate.getTime() !== new Date(existing.eventDate).getTime()) {
    res.status(400).json({ error: "Event start date must be in the future." });
    return;
  }
  if (parsedEventEndDate && parsedEventDate && parsedEventEndDate <= parsedEventDate) {
    res.status(400).json({ error: "Event end date must be after the start date." });
    return;
  }
  if (hasTicketPrice && ticketPriceRaw !== "" && Number.isNaN(parsedTicketPrice)) {
    res.status(400).json({ error: "Invalid ticketPrice." });
    return;
  }

  const eventStarted = now >= new Date(existing.eventDate);

  const datesEqual = (left, right) => {
    const l = left ? new Date(left).getTime() : null;
    const r = right ? new Date(right).getTime() : null;
    if (l == null && r == null) return true;
    if (l == null || r == null) return false;
    return l === r;
  };

  // Rule 2: After event start, organizer cannot change anything except add ticket quantities.
  if (eventStarted) {
    const changes = [];

    if (eventName && eventName !== String(existing.eventName || "")) changes.push("eventName");
    if (organizerName !== null && organizerName !== undefined && organizerName !== String(existing.organizerName || "")) changes.push("organizerName");
    if (eventAddress && eventAddress !== String(existing.eventAddress || "")) changes.push("eventAddress");
    if (paymentInstructions !== null && paymentInstructions !== undefined && paymentInstructions !== String(existing.paymentInstructions || "")) changes.push("paymentInstructions");
    if (parsedEventDate && !datesEqual(parsedEventDate, existing.eventDate)) changes.push("eventDate");
    if (hasEventEndDate && !datesEqual(parsedEventEndDate, existing.eventEndDate)) changes.push("eventEndDate");
    if (ticketType && ticketType !== String(existing.ticketType || "")) changes.push("ticketType");
    if (hasTicketPrice && (parsedTicketPrice ?? null) !== (existing.ticketPrice == null ? null : Number(existing.ticketPrice))) changes.push("ticketPrice");
    if (hasSalesCutoff && !datesEqual(parsedSalesCutoff, existing.salesCutoffAt)) changes.push("salesCutoffAt");
    if (salesWindowStart !== undefined && salesWindowStart !== (existing.salesWindowStart || null)) changes.push("salesWindowStart");
    if (salesWindowEnd !== undefined && salesWindowEnd !== (existing.salesWindowEnd || null)) changes.push("salesWindowEnd");
    if (maxTicketsPerEmail !== undefined && maxTicketsPerEmail !== (existing.maxTicketsPerEmail || null)) changes.push("maxTicketsPerEmail");
    if (hasDesignJson && incomingCurrency !== existingCurrency) changes.push("currency");

    const canonicalizeDesignForLock = (designJson) => {
      if (!designJson || typeof designJson !== "object") return "";
      const rawGroups = Array.isArray(designJson.ticketGroups) ? designJson.ticketGroups : [];
      const cleanedGroups = rawGroups
        .map((g) => {
          if (!g || typeof g !== "object") return null;
          const clone = { ...g };
          delete clone.quantity;
          delete clone.priceText;
          delete clone.ticketTypeLabel;
          return clone;
        })
        .filter(Boolean)
        .sort((a, b) => String(a.ticketType || "").localeCompare(String(b.ticketType || "")));
      const base = { ...designJson, ticketGroups: cleanedGroups };
      return JSON.stringify(base);
    };

    const allowQuantityIncreaseOnly = () => {
      if (!hasDesignJson) return false;
      const existingGroups = resolveTicketGroupsFromDesign(existing.designJson);
      const incomingGroups = resolveTicketGroupsFromDesign(incomingDesignJson);

      if (existingGroups.length !== incomingGroups.length) return false;
      const incomingMap = new Map(incomingGroups.map((g) => [g.ticketType, g]));
      for (const g of existingGroups) {
        const ng = incomingMap.get(g.ticketType);
        if (!ng) return false;
        const oldQty = Number(g.quantity || 0);
        const newQty = Number(ng.quantity || 0);
        if (newQty < oldQty) return false;
        const oldPrice = g.ticketPrice == null ? null : Number(g.ticketPrice);
        const newPrice = ng.ticketPrice == null ? null : Number(ng.ticketPrice);
        if (oldPrice !== newPrice) return false;
      }
      if (canonicalizeDesignForLock(existing.designJson) !== canonicalizeDesignForLock(incomingDesignJson)) return false;
      return true;
    };

    if (changes.length) {
      res.status(400).json({ error: "Event has started. You cannot change event details after the start time." });
      return;
    }
    if (hasDesignJson && !allowQuantityIncreaseOnly()) {
      res.status(400).json({ error: "Event has started. Only increasing ticket quantities is allowed." });
      return;
    }
  }

  // Rule 1: If any tickets are sold, lock currency and start/end times; prevent price decreases.
  if (!eventStarted && hasSoldTickets) {
    if (hasDesignJson && incomingCurrency !== existingCurrency) {
      res.status(400).json({ error: "Currency cannot be changed after tickets are sold." });
      return;
    }
    if (parsedEventDate && !datesEqual(parsedEventDate, existing.eventDate)) {
      res.status(400).json({ error: "Event start date/time cannot be changed after tickets are sold." });
      return;
    }
    if (hasEventEndDate && !datesEqual(parsedEventEndDate, existing.eventEndDate)) {
      res.status(400).json({ error: "Event end date/time cannot be changed after tickets are sold." });
      return;
    }
    if (hasTicketPrice) {
      const oldPrice = existing.ticketPrice == null ? null : Number(existing.ticketPrice);
      const newPrice = parsedTicketPrice == null ? null : Number(parsedTicketPrice);
      if (oldPrice != null && newPrice != null && newPrice < oldPrice) {
        res.status(400).json({ error: "Ticket price cannot be decreased after tickets are sold." });
        return;
      }
    }
    if (hasDesignJson && Array.isArray(incomingDesignJson?.ticketGroups)) {
      const existingGroups = resolveTicketGroupsFromDesign(existing.designJson);
      const existingMap = new Map(existingGroups.map((g) => [g.ticketType, g]));
      for (const group of incomingDesignJson.ticketGroups) {
        const type = String(group?.ticketType || "").trim();
        if (!type) continue;
        const old = existingMap.get(type);
        if (!old) continue;
        const oldPrice = old.ticketPrice == null ? null : Number(old.ticketPrice);
        const priceRaw = String(group?.ticketPrice ?? "").trim();
        const parsed = priceRaw === "" ? null : Number(priceRaw);
        const newPrice = Number.isFinite(parsed) ? parsed : null;
        if (oldPrice != null && newPrice != null && newPrice < oldPrice) {
          res.status(400).json({ error: "Ticket price cannot be decreased after tickets are sold." });
          return;
        }
      }
    }
  }

  // Guard: capacity cannot be set below already-sold count per ticket type
  if (hasDesignJson && Array.isArray(req.body.designJson?.ticketGroups)) {
    const soldByType = await prisma.ticket.groupBy({
      by: ["ticketType"],
      where: { eventId, OR: [{ ticketRequestId: { not: null } }, { status: "USED" }] },
      _count: { _all: true },
    });
    const soldMap = new Map(soldByType.map((r) => [String(r.ticketType || "").trim(), Number(r._count._all)]));
    for (const group of req.body.designJson.ticketGroups) {
      const type = String(group?.ticketType || "").trim();
      const newQty = Math.max(0, parseInt(String(group?.quantity || "0"), 10) || 0);
      const sold = soldMap.get(type) || 0;
      if (sold > 0 && newQty < sold) {
        res.status(400).json({ error: `Capacity for "${type || "General"}" cannot be less than the ${sold} ticket(s) already sold.` });
        return;
      }
    }
  }

  const nextSlug =
    eventName && eventName !== existing.eventName ? await generateEventSlug(eventName, existing.id) : undefined;

  const updated = await prisma.userEvent.update({
    where: { id: eventId },
    data: {
      ...(eventName ? { eventName } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, "organizerName")
        ? { organizerName: organizerName || null }
        : {}),
      ...(eventAddress ? { eventAddress } : {}),
      ...(nextSlug ? { slug: nextSlug } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, "paymentInstructions")
        ? { paymentInstructions: paymentInstructions || null }
        : {}),
      ...(parsedEventDate ? { eventDate: parsedEventDate } : {}),
      ...(hasEventEndDate ? { eventEndDate: parsedEventEndDate || null } : {}),
      ...(ticketType ? { ticketType } : {}),
      ...(hasTicketPrice ? { ticketPrice: parsedTicketPrice } : {}),
      ...(hasDesignJson ? { designJson: req.body.designJson } : {}),
      ...(hasSalesCutoff ? { salesCutoffAt: parsedSalesCutoff || null } : {}),
      ...(salesWindowStart !== undefined ? { salesWindowStart } : {}),
      ...(salesWindowEnd !== undefined ? { salesWindowEnd } : {}),
      ...(maxTicketsPerEmail !== undefined ? { maxTicketsPerEmail } : {}),
    },
    select: {
      id: true,
      slug: true,
      organizerName: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
      eventAddress: true,
      accessCode: true,
      ticketType: true,
      ticketPrice: true,
      paymentInstructions: true,
      designJson: true,
      salesCutoffAt: true,
      salesWindowStart: true,
      salesWindowEnd: true,
      maxTicketsPerEmail: true,
    },
  });

  // Keep existing editable tickets aligned with latest event editor changes.
  // Ticket verify pages read ticket-level snapshots (ticketType/ticketPrice/designJson),
  // so event-level updates alone are not enough for already-generated inventory.
  const shouldSyncTickets = Boolean(ticketType) || hasTicketPrice || hasDesignJson;
  if (shouldSyncTickets) {
    const editableTickets = await prisma.ticket.findMany({
      where: {
        eventId,
        ticketRequestId: null,
        deliveries: { none: { status: "SENT" } },
      },
      select: {
        id: true,
        ticketType: true,
      },
    });

    if (editableTickets.length) {
      const groups = hasDesignJson ? resolveTicketGroupsFromDesign(req.body.designJson) : [];
      const groupsMap = new Map(groups.map((group) => [group.ticketType, group]));
      const fallbackGroup = groups[0] || null;

      const updates = editableTickets.map((ticket) => {
        const currentType = String(ticket.ticketType || "").trim();
        const matchedGroup = currentType ? groupsMap.get(currentType) : null;
        const resolvedGroup = matchedGroup || fallbackGroup;

        const resolvedType = resolvedGroup?.ticketType || ticketType || currentType || updated.ticketType || "General";
        const resolvedPrice = resolvedGroup
          ? resolvedGroup.ticketPrice
          : hasTicketPrice
            ? parsedTicketPrice
            : null;
        const resolvedDesign = resolvedGroup
          ? resolvedGroup.groupDesign
          : hasDesignJson
            ? {
                ...req.body.designJson,
                ticketTypeLabel: resolvedType.toUpperCase(),
                priceText: normalizePriceText(hasTicketPrice ? parsedTicketPrice : updated.ticketPrice, req.body.designJson?.currency),
              }
            : null;

        const ticketUpdate = {
          ...(ticketType || resolvedGroup ? { ticketType: resolvedType } : {}),
          ...(hasTicketPrice || resolvedGroup ? { ticketPrice: resolvedPrice } : {}),
          ...(hasDesignJson ? { designJson: resolvedDesign } : {}),
        };

        return prisma.ticket.update({
          where: { id: ticket.id },
          data: ticketUpdate,
        });
      });

      await prisma.$transaction(updates);
    }
  }

  res.json({ event: updated });
}

async function createEventForAccessCode(req, res) {
  const captchaOk = await verifyTurnstile(req.body?.cfTurnstileToken, req.ip);
  if (!captchaOk) {
    res.status(403).json({ error: "CAPTCHA verification failed. Please try again." });
    return;
  }
  const accessCode = (req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const group = await resolveEventGroupByAccessCode(accessCode);
  if (!group) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  const blockedFromNewEvents = await isOrganizerBlockedFromNewEvents(group.organizerAccessCode);
  if (blockedFromNewEvents) {
    res.status(403).json({ error: BLOCK_NEW_EVENT_MESSAGE });
    return;
  }

  const eventName = sanitizeText(req.body?.eventName, LIMITS.EVENT_NAME);
  const organizerName = sanitizeText(req.body?.organizerName, LIMITS.NAME);
  const eventAddress = sanitizeText(req.body?.eventAddress, LIMITS.EVENT_ADDRESS);
  const paymentInstructions = sanitizeText(req.body?.paymentInstructions, LIMITS.PAYMENT_INSTRUCTIONS);
  const eventDateRaw = String(req.body?.eventDate || "").trim();
  const parsedEventDate = eventDateRaw ? new Date(eventDateRaw) : null;
  const eventEndDateRaw = String(req.body?.eventEndDate || "").trim();
  const parsedEventEndDate = eventEndDateRaw ? new Date(eventEndDateRaw) : null;

  if (!eventName || !eventAddress || !eventDateRaw) {
    res.status(400).json({ error: "eventName, eventAddress, and eventDate are required." });
    return;
  }
  if (Number.isNaN(parsedEventDate?.getTime())) {
    res.status(400).json({ error: "Invalid eventDate." });
    return;
  }
  if (eventEndDateRaw && Number.isNaN(parsedEventEndDate?.getTime())) {
    res.status(400).json({ error: "Invalid eventEndDate." });
    return;
  }
  if (parsedEventDate && parsedEventDate <= new Date()) {
    res.status(400).json({ error: "Event start date must be in the future." });
    return;
  }
  if (parsedEventEndDate && parsedEventDate && parsedEventEndDate <= parsedEventDate) {
    res.status(400).json({ error: "Event end date must be after the start date." });
    return;
  }

  const nextAccessCode = await generateAccessCode(async (candidate) => {
    const existing = await prisma.userEvent.findUnique({ where: { accessCode: candidate } });
    return !existing;
  });
  const slug = await generateEventSlug(eventName);
  const groupEmailVerified = group.events.some((e) => e.emailVerified === true);
  const groupOrganizerEmail = group.events
    .map((entry) => String(entry.organizerEmail || "").trim().toLowerCase())
    .find(Boolean) || null;
  const groupNotifyOnRequest = group.events.some((e) => e.notifyOnRequest === true);
  const groupNotifyOnMessage = group.events.some((e) => e.notifyOnMessage === true);
  const created = await prisma.userEvent.create({
    data: {
      organizerName: organizerName || null,
      organizerEmail: groupOrganizerEmail,
      eventName,
      eventAddress,
      eventDate: parsedEventDate,
      eventEndDate: parsedEventEndDate || null,
      paymentInstructions: paymentInstructions || null,
      quantity: 0,
      accessCode: nextAccessCode,
      organizerAccessCode: group.organizerAccessCode,
      slug,
      isDemo: false,
      emailVerified: groupEmailVerified,
      notifyOnRequest: groupNotifyOnRequest,
      notifyOnMessage: groupNotifyOnMessage,
    },
    select: {
      id: true,
      slug: true,
      organizerName: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
      eventAddress: true,
      accessCode: true,
      organizerAccessCode: true,
      createdAt: true,
      paymentInstructions: true,
    },
  });

  res.status(201).json({
    event: created,
    organizerAccessCode: group.organizerAccessCode,
  });
}

async function sendOrganizerNotificationTestEmail(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const event = await prisma.userEvent.findFirst({
    where: { OR: [{ accessCode }, { organizerAccessCode: accessCode }] },
    select: { organizerEmail: true, emailVerified: true, eventName: true, organizerAccessCode: true, accessCode: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const to = String(event.organizerEmail || "").trim().toLowerCase();
  if (!to) {
    res.status(400).json({ error: "Organizer email is missing. Verify your email in Settings first." });
    return;
  }
  if (event.emailVerified !== true) {
    res.status(400).json({ error: "Organizer email is not verified yet. Verify your email in Settings first." });
    return;
  }

  const baseUrl = getPublicBaseUrl();
  const canonicalCode = String(event.organizerAccessCode || event.accessCode || accessCode).trim();
  const dashboardUrl = `${baseUrl}/dashboard?code=${encodeURIComponent(canonicalCode)}&menu=settings`;

  try {
    await sendOrganizerBillingUpdateEmail({
      to,
      eventName: event.eventName,
      message: `Test email: Your notification email is working. Dashboard: ${dashboardUrl}`,
    });
  } catch (error) {
    logger.error("sendOrganizerNotificationTestEmail failed", error);
    res.status(500).json({ error: "Failed to send test email. Check SMTP configuration and try again." });
    return;
  }

  res.json({ sent: true });
}

function normalizeTicketsPerPage(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(4, Math.max(1, parsed));
}


async function getOrganizerNotifications(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }
  const event = await prisma.userEvent.findFirst({
    where: { OR: [{ accessCode }, { organizerAccessCode: accessCode }] },
    select: { organizerEmail: true, notifyOnRequest: true, notifyOnMessage: true, emailVerified: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  res.json({ organizerEmail: event.organizerEmail || "", notifyOnRequest: event.notifyOnRequest, notifyOnMessage: event.notifyOnMessage, emailVerified: event.emailVerified });
}

async function submitOrganizerInvoicePaymentEvidence(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  const invoiceId = String(req.params.invoiceId || "").trim();
  const eventId = String(req.body?.eventId || "").trim();
  if (!accessCode || !invoiceId || !eventId) {
    res.status(400).json({ error: "accessCode, invoiceId and eventId are required." });
    return;
  }

  try {
    const result = await submitInvoicePaymentEvidenceForOrganizer({
      organizerAccessCode: accessCode,
      invoiceId,
      eventId,
      note: req.body?.note,
      evidenceImageDataUrl: req.body?.evidenceImageDataUrl,
    });

    if (result?.evidence?.status === "PENDING") {
      prisma.userEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          eventName: true,
          organizerName: true,
          organizerEmail: true,
          organizerAccessCode: true,
          accessCode: true,
        },
      }).then((event) => {
        if (!event) return null;
        const organizerCode = String(event.organizerAccessCode || event.accessCode || "").trim();
        return sendAdminInvoiceEvidenceSubmittedEmail({
          organizerName: event.organizerName || "",
          organizerEmail: event.organizerEmail || "",
          organizerAccessCode: organizerCode,
          eventName: event.eventName || "",
          eventId: event.id,
          invoiceId,
          submittedAt: result?.evidence?.submittedAt || null,
        });
      }).catch((error) => {
        logger.warn("Failed to send admin invoice evidence submitted email", {
          eventId,
          invoiceId,
          error: error?.message || "unknown",
        });
      });
    }
    res.status(201).json(result);
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "BAD_INPUT" || code === "INVALID_TRANSITION") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (code === "FORBIDDEN") {
      res.status(403).json({ error: error.message });
      return;
    }
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
}

async function listOrganizerInvoicePaymentEvidence(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  const invoiceId = String(req.params.invoiceId || "").trim();
  if (!accessCode || !invoiceId) {
    res.status(400).json({ error: "accessCode and invoiceId are required." });
    return;
  }

  const invoice = await prisma.organizerInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      event: {
        select: {
          accessCode: true,
          organizerAccessCode: true,
        },
      },
    },
  });
  if (!invoice || !invoice.event) {
    res.status(404).json({ error: "Invoice not found." });
    return;
  }
  const canonicalCode = String(invoice.event.organizerAccessCode || invoice.event.accessCode || "").trim();
  if (!canonicalCode || canonicalCode !== accessCode) {
    res.status(403).json({ error: "Invalid organizer access code for this invoice." });
    return;
  }

  const items = await listInvoicePaymentEvidence(invoiceId);
  res.json({ items });
}

async function updateOrganizerNotifications(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }
  const notifyOnRequest = Boolean(req.body?.notifyOnRequest);
  const notifyOnMessage = Boolean(req.body?.notifyOnMessage);
  const result = await prisma.userEvent.updateMany({
    where: { OR: [{ accessCode }, { organizerAccessCode: accessCode }] },
    data: { notifyOnRequest, notifyOnMessage },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  res.json({ ok: true });
}

async function sendNotificationEmailOtp(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!accessCode) { res.status(400).json({ error: "accessCode is required." }); return; }
  if (!EMAIL_PATTERN.test(email)) { res.status(400).json({ error: "A valid email address is required." }); return; }

  const event = await prisma.userEvent.findFirst({
    where: { OR: [{ accessCode }, { organizerAccessCode: accessCode }] },
    select: { id: true },
  });
  if (!event) { res.status(404).json({ error: "Event not found." }); return; }

  // Invalidate any existing unused OTPs for this organizer+email
  await prisma.emailVerification.updateMany({
    where: { email, eventSlug: NOTIF_OTP_SLUG, verified: false, tokenUsed: false },
    data: { expiresAt: new Date(0) },
  });

  const code = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, "0");
  await prisma.emailVerification.create({
    data: { email, eventSlug: NOTIF_OTP_SLUG, code, expiresAt: new Date(Date.now() + OTP_EXPIRY_MS) },
  });

  try {
    await sendOtpEmail({ to: email, code });
  } catch (err) {
    logger.error("sendNotificationEmailOtp failed", err);
    res.status(500).json({ error: "Could not send verification email. Please try again." });
    return;
  }
  res.json({ sent: true });
}

async function verifyNotificationEmailOtp(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  if (!accessCode || !email || !code) { res.status(400).json({ error: "accessCode, email, and code are required." }); return; }

  const event = await prisma.userEvent.findFirst({
    where: { OR: [{ accessCode }, { organizerAccessCode: accessCode }] },
    select: { id: true },
  });
  if (!event) { res.status(404).json({ error: "Event not found." }); return; }

  const record = await prisma.emailVerification.findFirst({
    where: { email, eventSlug: NOTIF_OTP_SLUG, verified: false, tokenUsed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) { res.status(400).json({ error: "No active verification code found. Please request a new one." }); return; }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    res.status(400).json({ error: "Too many incorrect attempts. Please request a new code." });
    return;
  }
  if (record.code !== code) {
    await prisma.emailVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    const remaining = OTP_MAX_ATTEMPTS - record.attempts - 1;
    res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
    return;
  }

  await prisma.emailVerification.update({ where: { id: record.id }, data: { verified: true, tokenUsed: true } });

  // Resolve current organizer's canonical organizerAccessCode
  const currentEvent = await prisma.userEvent.findFirst({
    where: { OR: [{ accessCode }, { organizerAccessCode: accessCode }] },
    select: { accessCode: true, organizerAccessCode: true, eventName: true },
  });
  const canonicalOAC = currentEvent?.organizerAccessCode || currentEvent?.accessCode || accessCode;

  // Duplicate check: does another organizer group already have this email verified?
  const duplicate = await prisma.userEvent.findFirst({
    where: {
      emailVerified: true,
      organizerEmail: email,
      AND: [
        { organizerAccessCode: { not: canonicalOAC } },
        { accessCode: { not: canonicalOAC } },
      ],
    },
    select: { organizerAccessCode: true, accessCode: true, eventName: true },
  });
  if (duplicate) {
    const existingOAC = duplicate.organizerAccessCode || duplicate.accessCode;
    const existingEvents = await prisma.userEvent.findMany({
      where: { OR: [{ organizerAccessCode: existingOAC }, { accessCode: existingOAC }] },
      select: { eventName: true, accessCode: true, organizerAccessCode: true },
      orderBy: { createdAt: "asc" },
    });
    const entries = [{ organizerAccessCode: existingOAC, eventNames: existingEvents.map((e) => e.eventName) }];
    sendOrganizerRecoveryEmail({ to: email, entries }).catch((err) =>
      logger.error("sendOrganizerRecoveryEmail failed", err)
    );
    res.status(409).json({
      code: "EMAIL_ALREADY_REGISTERED",
      error: "An organizer account already exists for this email. Your organizer code has been sent to your email.",
    });
    return;
  }

  // Save verified email, mark emailVerified, and auto-enable notifications
  await prisma.userEvent.updateMany({
    where: { OR: [{ accessCode }, { organizerAccessCode: accessCode }] },
    data: { organizerEmail: email, emailVerified: true, notifyOnRequest: true, notifyOnMessage: true },
  });

  res.json({ ok: true });
}

async function mergeOrphanEvent(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  const orphanAccessCode = String(req.body?.orphanAccessCode || "").trim();
  if (!accessCode || !orphanAccessCode) {
    res.status(400).json({ error: "accessCode and orphanAccessCode are required." });
    return;
  }
  if (orphanAccessCode === accessCode) {
    res.status(400).json({ error: "Cannot merge an account into itself." });
    return;
  }

  try {
    const destinationGroup = await resolveEventGroupByAccessCode(accessCode);
    if (!destinationGroup) {
      res.status(404).json({ error: "Destination account not found." });
      return;
    }
    const canonicalOAC = destinationGroup.organizerAccessCode;

    if (orphanAccessCode === canonicalOAC) {
      res.status(400).json({ error: "Cannot merge an account into itself." });
      return;
    }

    const [orphan, destinationEvent] = await Promise.all([
      prisma.userEvent.findFirst({
        where: { OR: [{ accessCode: orphanAccessCode }, { organizerAccessCode: orphanAccessCode }] },
        select: { id: true, emailVerified: true, organizerEmail: true, createdAt: true, organizerAccessCode: true, accessCode: true },
      }),
      prisma.userEvent.findFirst({
        where: { OR: [{ accessCode: canonicalOAC }, { organizerAccessCode: canonicalOAC }] },
        select: { organizerEmail: true },
      }),
    ]);

    if (!orphan) {
      res.status(404).json({ error: "Orphan event not found." });
      return;
    }
    if (orphan.emailVerified === true || (orphan.organizerEmail && orphan.organizerEmail.trim())) {
      res.status(400).json({ error: "This event belongs to a verified account and cannot be merged." });
      return;
    }
    if (Date.now() - new Date(orphan.createdAt).getTime() > 24 * 60 * 60 * 1000) {
      res.status(400).json({ error: "This event is too old to be merged. Only recently created unverified events can be merged." });
      return;
    }
    const orphanGroup = await resolveEventGroupByAccessCode(orphanAccessCode);
    if (orphanGroup && orphanGroup.organizerAccessCode === canonicalOAC) {
      res.status(400).json({ error: "This event is already part of your account." });
      return;
    }

    await prisma.userEvent.updateMany({
      where: { OR: [{ accessCode: orphanAccessCode }, { organizerAccessCode: orphanAccessCode }] },
      data: {
        organizerAccessCode: canonicalOAC,
        emailVerified: true,
        organizerEmail: destinationEvent?.organizerEmail || null,
      },
    });

    const merged = await prisma.userEvent.findFirst({
      where: { accessCode: orphanAccessCode },
      select: { eventName: true, eventDate: true, eventAddress: true, accessCode: true },
    });

    res.json({ merged: true, event: merged });
  } catch (err) {
    logger.error("mergeOrphanEvent error", err);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
}

module.exports = {
  createLiveEvent,
  createDemoEvent,
  createEventForAccessCode,
  getEventByCode,
  getEventTickets,
  generateTicketsByAccessCode,
  updateEventInline,
  getOrganizerNotifications,
  updateOrganizerNotifications,
  sendNotificationEmailOtp,
  verifyNotificationEmailOtp,
  sendOrganizerNotificationTestEmail,
  submitOrganizerInvoicePaymentEvidence,
  listOrganizerInvoicePaymentEvidence,
  mergeOrphanEvent,
};
