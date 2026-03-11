const puppeteer = require("puppeteer");
const QRCode = require("qrcode");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const prisma = require("../utils/prisma");
const { generateAccessCode } = require("../utils/accessCode");
const { createEvent, buildQrPayload } = require("../services/eventService");
const { generateTicketPublicId } = require("../utils/ticketPublicId");
const {
  renderTicketCardHtml,
  renderTicketDocumentHtml,
  resolveTicketDesign,
} = require("../services/ticketTemplate");
const {
  DEFAULT_TICKET_TYPE,
  reservePendingTicketIds,
} = require("../services/pendingTicketReservations");

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
    eventName: event.eventName,
    eventDate: event.eventDate,
    eventAddress: event.eventAddress,
    accessCode: event.accessCode,
    createdAt: event.createdAt,
  };
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
      eventName: true,
      eventDate: true,
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

function formatLockedDeliveryMethods(methods) {
  return methods.map((method) => {
    if (method === "PDF_DOWNLOAD") return "PDF download";
    if (method === "EMAIL_LINK") return "email";
    if (method === "PUBLIC_EVENT_PAGE") return "public event page";
    return String(method || "").toLowerCase();
  });
}

function normalizePriceText(value) {
  if (value == null) return "Free";
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return `$${parsed.toFixed(2)}`;
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
          priceText: normalizePriceText(ticketPrice),
          headerImageDataUrl: group?.headerImageDataUrl || null,
          headerOverlay: Number(group?.headerOverlay ?? designJson?.headerOverlay ?? 0.25),
          headerTextColorMode: String(group?.headerTextColorMode || designJson?.headerTextColorMode || "AUTO"),
        },
      };
    })
    .filter((group) => group.ticketType);
}

async function getEventTicketMutationLock(eventId) {
  const [deliveryMethodsRaw, soldCount, soldByTypeRaw] = await Promise.all([
    prisma.ticketDelivery.findMany({
      where: {
        status: "SENT",
        ticket: { eventId },
      },
      distinct: ["method"],
      select: { method: true },
    }),
    prisma.ticket.count({
      where: { eventId, ticketRequestId: { not: null } },
    }),
    prisma.ticket.groupBy({
      by: ["ticketType"],
      where: { eventId, ticketRequestId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const methods = deliveryMethodsRaw.map((item) => item.method).filter(Boolean);
  if (soldCount > 0) methods.push("PUBLIC_EVENT_PAGE");
  const uniqueMethods = Array.from(new Set(methods));
  if (!uniqueMethods.length) return null;

  const friendlyMethods = formatLockedDeliveryMethods(uniqueMethods);
  const soldByType = soldByTypeRaw
    .map((row) => ({
      ticketType: String(row?.ticketType || "General").trim() || "General",
      count: Number(row?._count?._all || 0),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const soldTicketType = soldByType.length
    ? soldByType.map((row) => `${row.count} ${row.ticketType}`).join(", ")
    : "Mixed";
  const error = soldCount > 0
    ? `You cant make changes on the event/ticket(s) ! you already deliverd ${soldCount} ticket(s) (${soldTicketType}) through public event page. Create a new event from the events menu.`
    : `You cant make changes on the event/ticket(s) ! you already deliverd tickets through ${friendlyMethods.join(", ")}. Create a new event from the events menu.`;

  return {
    code: "EVENT_TICKETS_LOCKED",
    deliveryMethods: friendlyMethods,
    soldTicketsCount: soldCount,
    soldTicketType,
    error,
  };
}

async function createLiveEvent(req, res) {
  try {
    const data = await createEvent(req.body || {}, false);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create event." });
  }
}

async function createDemoEvent(req, res) {
  try {
    const data = await createEvent(req.body || {}, true);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create demo event." });
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
  const soldTickets = await prisma.ticket.count({ where: { eventId: event.id, ticketRequestId: { not: null } } });

  const scans = await prisma.scanRecord.findMany({
    where: { eventId: event.id },
    orderBy: { scannedAt: "desc" },
    take: 100,
    select: { ticketPublicId: true, result: true, scannedAt: true },
  });

  res.json({
    organizerAccessCode: group.organizerAccessCode,
    events: group.events.map(toEventListItem),
    selectedEventId: event.id,
    event,
    totalTickets,
    scannedTickets,
    remainingTickets: Math.max(0, totalTickets - soldTickets),
    scans,
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
        deliveries: {
          where: { status: "SENT" },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { method: true, sentAt: true, email: true },
        },
      },
    }),
    prisma.ticketRequest.findMany({
      where: { eventId, status: "PENDING_PAYMENT" },
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

  const eventName = String(req.body?.eventName || "").trim();
  const eventAddress = String(req.body?.eventAddress || "").trim();
  const rawEventDate = String(req.body?.eventDateTime || req.body?.dateTimeText || "").trim();
  const parsedEventDate = rawEventDate ? new Date(rawEventDate) : null;
  const designJson = req.body?.designJson && typeof req.body.designJson === "object" ? req.body.designJson : null;
  const designGroups = Array.isArray(designJson?.ticketGroups) ? designJson.ticketGroups : [];

  const fallbackQuantity = Math.max(0, Number.parseInt(String(req.body?.quantity || "0"), 10) || 0);
  const fallbackType = String(req.body?.ticketType || "").trim();
  const fallbackPriceRaw = String(req.body?.ticketPrice || "").trim();

  const normalizedGroups = (designGroups.length ? designGroups : [{
    ticketType: fallbackType || "General",
    ticketPrice: fallbackPriceRaw,
    quantity: String(fallbackQuantity),
    headerImageDataUrl: designJson?.headerImageDataUrl || null,
    headerOverlay: designJson?.headerOverlay ?? 0.25,
    headerTextColorMode: designJson?.headerTextColorMode || "AUTO",
  }])
    .map((group, index) => {
      const quantity = Math.max(0, Number.parseInt(String(group?.quantity || "0"), 10) || 0);
      const ticketType = String(group?.ticketType || "").trim() || `Type ${index + 1}`;
      const ticketPriceRaw = String(group?.ticketPrice ?? "").trim();
      const parsedPrice = ticketPriceRaw === "" ? null : Number(ticketPriceRaw);
      const ticketPrice = Number.isFinite(parsedPrice) ? parsedPrice : null;
      const resolvedPriceText = ticketPriceRaw
        ? Number.isFinite(parsedPrice) && parsedPrice > 0
          ? `$${parsedPrice.toFixed(2)}`
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
      ...(eventName ? { eventName } : {}),
      ...(eventAddress ? { eventAddress } : {}),
      ...(parsedEventDate && !Number.isNaN(parsedEventDate.getTime()) ? { eventDate: parsedEventDate } : {}),
      ...(primaryGroup?.ticketType ? { ticketType: primaryGroup.ticketType } : {}),
      ...(primaryGroup && primaryGroup.ticketPrice != null ? { ticketPrice: primaryGroup.ticketPrice } : {}),
      ...(designJson ? { designJson } : {}),
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
    select: { id: true, accessCode: true, organizerAccessCode: true, eventName: true },
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
  const eventLock = await getEventTicketMutationLock(existing.id);
  if (eventLock) {
    res.status(409).json(eventLock);
    return;
  }

  const eventName = String(req.body?.eventName || "").trim();
  const eventAddress = String(req.body?.eventAddress || "").trim();
  const paymentInstructions = String(req.body?.paymentInstructions || "").trim();
  const eventDateRaw = String(req.body?.eventDate || "").trim();
  const parsedEventDate = eventDateRaw ? new Date(eventDateRaw) : null;
  const ticketType = String(req.body?.ticketType || "").trim();
  const hasTicketPrice = Object.prototype.hasOwnProperty.call(req.body || {}, "ticketPrice");
  const ticketPriceRaw = String(req.body?.ticketPrice ?? "").trim();
  const parsedTicketPrice = ticketPriceRaw === "" ? null : Number(ticketPriceRaw);
  const hasDesignJson =
    Object.prototype.hasOwnProperty.call(req.body || {}, "designJson") &&
    req.body?.designJson &&
    typeof req.body.designJson === "object";

  if (eventDateRaw && Number.isNaN(parsedEventDate?.getTime())) {
    res.status(400).json({ error: "Invalid eventDate." });
    return;
  }
  if (hasTicketPrice && ticketPriceRaw !== "" && Number.isNaN(parsedTicketPrice)) {
    res.status(400).json({ error: "Invalid ticketPrice." });
    return;
  }

  const nextSlug =
    eventName && eventName !== existing.eventName ? await generateEventSlug(eventName, existing.id) : undefined;

  const updated = await prisma.userEvent.update({
    where: { id: eventId },
    data: {
      ...(eventName ? { eventName } : {}),
      ...(eventAddress ? { eventAddress } : {}),
      ...(nextSlug ? { slug: nextSlug } : {}),
      ...(Object.prototype.hasOwnProperty.call(req.body || {}, "paymentInstructions")
        ? { paymentInstructions: paymentInstructions || null }
        : {}),
      ...(parsedEventDate ? { eventDate: parsedEventDate } : {}),
      ...(ticketType ? { ticketType } : {}),
      ...(hasTicketPrice ? { ticketPrice: parsedTicketPrice } : {}),
      ...(hasDesignJson ? { designJson: req.body.designJson } : {}),
    },
    select: {
      id: true,
      slug: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      accessCode: true,
      ticketType: true,
      ticketPrice: true,
      paymentInstructions: true,
      designJson: true,
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
                priceText: normalizePriceText(hasTicketPrice ? parsedTicketPrice : updated.ticketPrice),
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

  const eventName = String(req.body?.eventName || "").trim();
  const eventAddress = String(req.body?.eventAddress || "").trim();
  const paymentInstructions = String(req.body?.paymentInstructions || "").trim();
  const eventDateRaw = String(req.body?.eventDate || "").trim();
  const parsedEventDate = eventDateRaw ? new Date(eventDateRaw) : null;

  if (!eventName || !eventAddress || !eventDateRaw) {
    res.status(400).json({ error: "eventName, eventAddress, and eventDate are required." });
    return;
  }
  if (Number.isNaN(parsedEventDate?.getTime())) {
    res.status(400).json({ error: "Invalid eventDate." });
    return;
  }

  const nextAccessCode = await generateAccessCode(async (candidate) => {
    const existing = await prisma.userEvent.findUnique({ where: { accessCode: candidate } });
    return !existing;
  });
  const slug = await generateEventSlug(eventName);
  const created = await prisma.userEvent.create({
    data: {
      eventName,
      eventAddress,
      eventDate: parsedEventDate,
      paymentInstructions: paymentInstructions || null,
      quantity: 0,
      accessCode: nextAccessCode,
      organizerAccessCode: group.organizerAccessCode,
      slug,
      isDemo: false,
    },
    select: {
      id: true,
      slug: true,
      eventName: true,
      eventDate: true,
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

function normalizeTicketsPerPage(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(4, Math.max(1, parsed));
}

async function buildTicketsPdfBuffer(event, tickets, ticketsPerPage) {
  const cards = [];
  for (const ticket of tickets) {
    const payload = ticket.qrPayload || buildQrPayload(ticket.ticketPublicId);
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, width: 320 });
    const design = resolveTicketDesign(event, ticket);
    cards.push(
      renderTicketCardHtml({
        design,
        qrDataUrl,
        ticketPublicId: ticket.ticketPublicId,
      }),
    );
  }

  const safeTicketsPerPage = normalizeTicketsPerPage(ticketsPerPage);
  const pageSections = [];
  for (let index = 0; index < cards.length; index += safeTicketsPerPage) {
    const pageCards = cards
      .slice(index, index + safeTicketsPerPage)
      .map((cardHtml) => `<div class="ticket-slot">${cardHtml}</div>`)
      .join("");
    pageSections.push(
      `<section class="ticket-page mode-${safeTicketsPerPage}"><div class="ticket-grid">${pageCards}</div></section>`,
    );
  }

  const html = renderTicketDocumentHtml({
    pagesHtml: pageSections.join(""),
    ticketsPerPage: safeTicketsPerPage,
  });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      printBackground: true,
      format: "A4",
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function buildFallbackPdfBuffer(event, tickets, ticketsPerPage) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 36;
  const safeTicketsPerPage = normalizeTicketsPerPage(ticketsPerPage);
  const verticalGap = 12;
  const usableHeight = pageHeight - margin * 2 - verticalGap * (safeTicketsPerPage - 1);
  const cardHeight = usableHeight / safeTicketsPerPage;

  for (let index = 0; index < tickets.length; index += 1) {
    if (index % safeTicketsPerPage === 0) {
      pdf.addPage([pageWidth, pageHeight]);
    }

    const page = pdf.getPages()[pdf.getPageCount() - 1];
    const slot = index % safeTicketsPerPage;
    const x = margin;
    const y = pageHeight - margin - cardHeight - slot * (cardHeight + verticalGap);
    const ticket = tickets[index];
    const design = resolveTicketDesign(event, ticket);
    const payload = ticket.qrPayload || buildQrPayload(ticket.ticketPublicId);
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, width: 256 });
    const qrBase64 = qrDataUrl.split(",")[1];
    const qrImage = await pdf.embedPng(Buffer.from(qrBase64, "base64"));
    const headingSize = safeTicketsPerPage >= 4 ? 12 : safeTicketsPerPage === 3 ? 14 : 16;
    const detailSize = safeTicketsPerPage >= 4 ? 8 : 10;
    const ticketIdSize = safeTicketsPerPage >= 4 ? 9 : 11;
    const qrSize = Math.min(120, Math.max(72, cardHeight - 42));

    page.drawRectangle({
      x,
      y,
      width: pageWidth - margin * 2,
      height: cardHeight,
      borderWidth: 1,
      borderColor: rgb(0.8, 0.8, 0.8),
    });

    page.drawText(String(design.eventName || event.eventName || ""), { x: x + 16, y: y + cardHeight - (headingSize + 12), size: headingSize, font: bold });
    page.drawText(String(design.dateTimeText || new Date(event.eventDate).toLocaleString()), { x: x + 16, y: y + cardHeight - (headingSize + detailSize + 16), size: detailSize, font });
    page.drawText(String(design.location || event.eventAddress || ""), { x: x + 16, y: y + cardHeight - (headingSize + detailSize * 2 + 20), size: detailSize, font });
    page.drawText(`Type: ${String(design.ticketTypeLabel || ticket.ticketType || "General")}`, { x: x + 16, y: y + 30, size: detailSize, font });
    page.drawText(`Price: ${String(design.priceText || ticket.ticketPrice || "Free")}`, { x: x + 16, y: y + 18, size: detailSize, font });
    page.drawText(`Ticket ID: ${ticket.ticketPublicId}`, { x: x + 16, y: y + 6, size: ticketIdSize, font: bold });
    page.drawImage(qrImage, { x: pageWidth - margin - qrSize - 20, y: y + 10, width: qrSize, height: qrSize });
  }

  return Buffer.from(await pdf.save());
}

function normalizePdfOutput(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  if (Array.isArray(payload)) return Buffer.from(payload);

  if (typeof payload === "string") {
    try {
      return normalizePdfOutput(JSON.parse(payload));
    } catch {
      return Buffer.from(payload, "utf8");
    }
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) return Buffer.from(payload.data);
    if (typeof payload.data === "string") return Buffer.from(payload.data, "base64");

    const numericKeys = Object.keys(payload)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));

    if (numericKeys.length > 0) {
      const values = numericKeys.map((key) => Number(payload[key]) || 0);
      return Buffer.from(values);
    }
  }

  return Buffer.alloc(0);
}

async function getTicketsPdf(req, res) {
  try {
    const eventId = (req.params.eventId || "").trim();
    if (!eventId) {
      res.status(400).json({ error: "eventId is required." });
      return;
    }

    const event = await prisma.userEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        eventName: true,
        eventDate: true,
        eventAddress: true,
        accessCode: true,
        ticketType: true,
        ticketPrice: true,
        designJson: true,
      },
    });

    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }

    const requestedCount = Math.max(1, Number.parseInt(String(req.query?.count || "1"), 10) || 1);

    const [availableTickets, pendingRequests] = await Promise.all([
      prisma.ticket.findMany({
        where: {
          eventId,
          ticketRequestId: null,
          isInvalidated: false,
          status: "UNUSED",
          deliveries: { none: { status: "SENT" } },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          ticketPublicId: true,
          qrPayload: true,
          ticketType: true,
          ticketPrice: true,
          designJson: true,
        },
      }),
      prisma.ticketRequest.findMany({
        where: { eventId, status: "PENDING_PAYMENT" },
        orderBy: { createdAt: "asc" },
        select: { ticketType: true, quantity: true, ticketSelections: true },
      }),
    ]);

    if (!availableTickets.length) {
      res.status(400).json({ error: "No undelivered tickets are available for PDF download. Generate more tickets." });
      return;
    }

    const reservedPendingTicketIds = reservePendingTicketIds({
      availableTickets,
      pendingRequests,
      fallbackTicketType: event.ticketType || DEFAULT_TICKET_TYPE,
    });
    const downloadableTickets = availableTickets.filter((ticket) => !reservedPendingTicketIds.has(ticket.id));

    if (!downloadableTickets.length) {
      res.status(400).json({
        error: `You have ${reservedPendingTicketIds.size} tickets requested. You can only download 0 tickets right now.`,
        availableTickets: 0,
        requestedTickets: requestedCount,
        pendingRequestedTickets: reservedPendingTicketIds.size,
      });
      return;
    }
    if (requestedCount > downloadableTickets.length) {
      const message = reservedPendingTicketIds.size
        ? `You have ${reservedPendingTicketIds.size} tickets requested. You can only download ${downloadableTickets.length} tickets.`
        : `You have only ${downloadableTickets.length} tickets left to deliver.`;
      res.status(400).json({
        error: message,
        availableTickets: downloadableTickets.length,
        requestedTickets: requestedCount,
        pendingRequestedTickets: reservedPendingTicketIds.size,
      });
      return;
    }

    const tickets = downloadableTickets.slice(0, requestedCount);

    const ticketsPerPage = normalizeTicketsPerPage(req.query?.perPage);

    // Use deterministic fixed HTML print wrappers first; fallback to pdf-lib only if html rendering fails.
    let pdfBuffer;
    try {
      pdfBuffer = await buildTicketsPdfBuffer(event, tickets, ticketsPerPage);
    } catch (error) {
      console.error("html-pdf generation failed; using fallback pdf-lib renderer", error);
      pdfBuffer = await buildFallbackPdfBuffer(event, tickets, ticketsPerPage);
    }
    const output = normalizePdfOutput(pdfBuffer);
    if (!output.length) {
      throw new Error("PDF generation returned empty data.");
    }

    await prisma.ticketDelivery.createMany({
      data: tickets.map((ticket) => ({
        ticketId: ticket.id,
        email: "pdf-download@local.delivery",
        method: "PDF_DOWNLOAD",
        status: "SENT",
      })),
    });

    const remainingDeliverable = Math.max(0, downloadableTickets.length - tickets.length);

    const safeName = (event.eventName || "tickets").replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-tickets.pdf"`);
    res.setHeader("Content-Length", String(output.length));
    res.setHeader("X-Tickets-Downloaded", String(tickets.length));
    res.setHeader("X-Tickets-Remaining-Deliverable", String(remainingDeliverable));
    res.setHeader("X-Tickets-Pending-Requested", String(reservedPendingTicketIds.size));
    res.send(output);
  } catch (error) {
    console.error("getTicketsPdf error", error);
    res.status(500).json({ error: "Could not generate tickets PDF." });
  }
}

module.exports = {
  createLiveEvent,
  createDemoEvent,
  createEventForAccessCode,
  getEventByCode,
  getEventTickets,
  generateTicketsByAccessCode,
  getTicketsPdf,
  updateEventInline,
};
