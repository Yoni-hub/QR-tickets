const prisma = require("../utils/prisma");
const { generateAccessCode } = require("../utils/accessCode");
const { getPublicBaseUrl } = require("../services/eventService");
const { resolveConfiguredAdminKey } = require("../middleware/adminAuth");
const { writeAdminAuditLog } = require("../utils/adminAudit");
const {
  SUPPORTED_CURRENCIES,
  FINAL_INVOICE_TYPE,
  markInvoicePaid,
  addInvoicePayment,
  retryInvoiceDelivery,
  listInvoicePaymentEvidence,
  approveInvoicePaymentEvidence,
  allowInvoiceEvidenceAttachment,
  setOrganizerInvoiceEvidenceAutoApprove,
} = require("../services/organizerInvoiceService");
const { sendAdminInvoiceEvidenceSubmittedEmail } = require("../utils/mailer");

function normalizeLimit(rawValue, fallback = 50, min = 1, max = 200) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseDateBoundary(rawValue, mode) {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (mode === "end") {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
}

function buildDateWhere(fieldName, from, to) {
  const start = parseDateBoundary(from, "start");
  const end = parseDateBoundary(to, "end");
  if (!start && !end) return undefined;

  return {
    [fieldName]: {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    },
  };
}

function statusFromTicket(ticket) {
  if (ticket.isInvalidated) return "invalidated";
  if (ticket.status === "USED") return "used";
  return "valid-unused";
}

function resolveLatestDelivery(deliveries) {
  if (!Array.isArray(deliveries) || !deliveries.length) return null;
  return deliveries[0];
}

function buildTicketUrl(ticketPublicId) {
  return `${getPublicBaseUrl()}/t/${ticketPublicId}`;
}

async function getAdminOverview(_req, res) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [
    totalEvents,
    totalTickets,
    totalScans,
    validScans,
    usedScans,
    invalidScans,
    deliveriesSent,
    deliveryFailures,
    eventsCreatedToday,
    recentEventsRaw,
    recentScansRaw,
    recentDeliveryFailuresRaw,
    recentTicketRequestsRaw,
  ] = await Promise.all([
    prisma.userEvent.count(),
    prisma.ticket.count(),
    prisma.scanRecord.count(),
    prisma.scanRecord.count({ where: { result: "VALID" } }),
    prisma.scanRecord.count({ where: { result: "USED" } }),
    prisma.scanRecord.count({ where: { result: "INVALID" } }),
    prisma.ticketDelivery.count({ where: { status: "SENT" } }),
    prisma.ticketDelivery.count({ where: { status: "FAILED" } }),
    prisma.userEvent.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.userEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        eventName: true,
        eventDate: true,
        eventAddress: true,
        accessCode: true,
        createdAt: true,
        adminStatus: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.scanRecord.findMany({
      orderBy: { scannedAt: "desc" },
      take: 10,
      select: {
        id: true,
        scannedAt: true,
        ticketPublicId: true,
        normalizedTicketPublicId: true,
        result: true,
        event: {
          select: {
            id: true,
            eventName: true,
            accessCode: true,
          },
        },
        ticket: {
          select: {
            deliveries: {
              orderBy: { sentAt: "desc" },
              take: 1,
              select: { email: true },
            },
          },
        },
      },
    }),
    prisma.ticketDelivery.findMany({
      where: { status: "FAILED" },
      orderBy: { sentAt: "desc" },
      take: 8,
      select: {
        id: true,
        email: true,
        status: true,
        errorMessage: true,
        sentAt: true,
        ticket: {
          select: {
            ticketPublicId: true,
            event: {
              select: {
                id: true,
                eventName: true,
                accessCode: true,
              },
            },
          },
        },
      },
    }),
    prisma.ticketRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        clientProfile: { select: { clientAccessToken: true } },
        createdAt: true,
        event: {
          select: {
            id: true,
            eventName: true,
            accessCode: true,
          },
        },
      },
    }),
  ]);

  const eventIds = recentEventsRaw.map((event) => event.id);
  const scannedByEvent = eventIds.length
    ? await prisma.ticket.groupBy({
        by: ["eventId"],
        where: {
          eventId: { in: eventIds },
          status: "USED",
        },
        _count: { _all: true },
      })
    : [];

  const scannedMap = new Map(scannedByEvent.map((row) => [row.eventId, row._count._all]));

  const recentEvents = recentEventsRaw.map((event) => {
    const ticketsTotal = event._count.tickets;
    const scannedCount = scannedMap.get(event.id) || 0;
    return {
      eventId: event.id,
      eventName: event.eventName,
      eventDate: event.eventDate,
      location: event.eventAddress,
      accessCode: event.accessCode,
      ticketsTotal,
      scannedCount,
      createdAt: event.createdAt,
      status: String(event.adminStatus || "ACTIVE").toLowerCase(),
    };
  });

  const recentScans = recentScansRaw.map((scan) => ({
    scanId: scan.id,
    timestamp: scan.scannedAt,
    eventId: scan.event?.id || null,
    eventName: scan.event?.eventName || "Unknown event",
    accessCode: scan.event?.accessCode || "-",
    ticketPublicId: scan.ticketPublicId,
    attendeeName: null,
    attendeeEmail: scan.ticket?.deliveries?.[0]?.email || null,
    result: scan.result,
    parsedValue: scan.normalizedTicketPublicId || scan.ticketPublicId,
  }));

  const recentDeliveryFailures = recentDeliveryFailuresRaw.map((delivery) => ({
    deliveryId: delivery.id,
    eventId: delivery.ticket.event.id,
    eventName: delivery.ticket.event.eventName,
    accessCode: delivery.ticket.event.accessCode,
    ticketPublicId: delivery.ticket.ticketPublicId,
    recipientEmail: delivery.email,
    status: delivery.status,
    providerMessage: delivery.errorMessage,
    attemptedAt: delivery.sentAt,
  }));

  const baseUrl = getPublicBaseUrl();
  const recentTicketRequests = recentTicketRequestsRaw.map((request) => ({
    requestId: request.id,
    eventId: request.event?.id || null,
    eventName: request.event?.eventName || "Unknown event",
    accessCode: request.event?.accessCode || "-",
    buyerName: request.name,
    buyerEmail: request.email,
    status: request.status,
    clientAccessToken: request.clientProfile?.clientAccessToken || null,
    clientDashboardUrl: request.clientProfile?.clientAccessToken ? `${baseUrl}/client/${request.clientProfile.clientAccessToken}` : null,
    createdAt: request.createdAt,
  }));

  res.json({
    metrics: {
      totalEvents,
      totalTickets,
      totalScans,
      validScans,
      usedScans,
      invalidScans,
      deliveriesSent,
      deliveryFailures,
      eventsCreatedToday,
    },
    recentEvents,
    recentScans,
    recentDeliveryFailures,
    recentTicketRequests,
  });
}

async function listAdminEvents(req, res) {
  const limit = normalizeLimit(req.query.limit, 100, 1, 300);
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim().toUpperCase();

  const where = {
    ...(search
      ? {
          OR: [
            { eventName: { contains: search, mode: "insensitive" } },
            { accessCode: { contains: search, mode: "insensitive" } },
            { organizerAccessCode: { contains: search, mode: "insensitive" } },
            { organizerName: { contains: search, mode: "insensitive" } },
            { organizerEmail: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status && ["ACTIVE", "DISABLED", "ARCHIVED"].includes(status)
      ? { adminStatus: status }
      : {}),
    ...buildDateWhere("eventDate", req.query.dateFrom, req.query.dateTo),
  };

  const rows = await prisma.userEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
      eventAddress: true,
      paymentInstructions: true,
      salesCutoffAt: true,
      salesWindowStart: true,
      salesWindowEnd: true,
      maxTicketsPerEmail: true,
      accessCode: true,
      organizerName: true,
      organizerEmail: true,
      organizerAccessCode: true,
      createdAt: true,
      adminStatus: true,
      scannerLocked: true,
      _count: {
        select: { tickets: true },
      },
    },
  });

  const eventIds = rows.map((row) => row.id);
  const [scannedGrouped, invalidatedGrouped] = eventIds.length
    ? await Promise.all([
        prisma.ticket.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds }, status: "USED" },
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds }, isInvalidated: true },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const scannedMap = new Map(scannedGrouped.map((row) => [row.eventId, row._count._all]));
  const invalidatedMap = new Map(invalidatedGrouped.map((row) => [row.eventId, row._count._all]));

  const items = rows.map((row) => {
    const ticketsTotal = row._count.tickets;
    const ticketsScanned = scannedMap.get(row.id) || 0;
    const invalidatedCount = invalidatedMap.get(row.id) || 0;
    return {
      eventId: row.id,
      eventName: row.eventName,
      eventDate: row.eventDate,
      eventEndDate: row.eventEndDate,
      location: row.eventAddress,
      paymentMethod: row.paymentInstructions ? "MANUAL_INSTRUCTION" : "NOT_CONFIGURED",
      stopSellingAfter: row.salesCutoffAt,
      salesWindowStart: row.salesWindowStart,
      salesWindowEnd: row.salesWindowEnd,
      maxTicketsPerEmail: row.maxTicketsPerEmail,
      accessCode: row.accessCode,
      organizerName: row.organizerName || null,
      organizerEmail: row.organizerEmail || null,
      organizerAccessCode: row.organizerAccessCode || null,
      ticketsTotal,
      ticketsScanned,
      ticketsRemaining: Math.max(0, ticketsTotal - ticketsScanned - invalidatedCount),
      createdAt: row.createdAt,
      status: String(row.adminStatus || "ACTIVE").toLowerCase(),
      scannerLocked: row.scannerLocked ?? false,
      invalidatedCount,
    };
  });

  res.json({ items });
}

async function getAdminEventDetail(req, res) {
  const eventId = String(req.params.eventId || "").trim();
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
      eventEndDate: true,
      eventAddress: true,
      accessCode: true,
      organizerAccessCode: true,
      createdAt: true,
      designJson: true,
      quantity: true,
      ticketType: true,
      ticketPrice: true,
      adminStatus: true,
      adminDisabledAt: true,
      archivedAt: true,
      invoiceEvidenceAutoApprove: true,
      _count: { select: { tickets: true } },
    },
  });

  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const [
    scannedCount,
    invalidatedCount,
    scanSummaryRaw,
    lastScan,
    deliverySummaryRaw,
    ticketsRaw,
    viewCountsRaw,
    latestInvoice,
  ] = await Promise.all([
    prisma.ticket.count({ where: { eventId, status: "USED" } }),
    prisma.ticket.count({ where: { eventId, isInvalidated: true } }),
    prisma.scanRecord.groupBy({
      by: ["result"],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.scanRecord.findFirst({
      where: { eventId },
      orderBy: { scannedAt: "desc" },
      select: { scannedAt: true },
    }),
    prisma.ticketDelivery.groupBy({
      by: ["status"],
      where: { ticket: { eventId } },
      _count: { _all: true },
    }),
    prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ticketPublicId: true,
        qrPayload: true,
        status: true,
        scannedAt: true,
        createdAt: true,
        isInvalidated: true,
        invalidatedAt: true,
        deliveries: {
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { id: true, email: true, status: true, sentAt: true, errorMessage: true },
        },
      },
    }),
    prisma.ticketViewLog.groupBy({
      by: ["ticketId"],
      where: { ticket: { eventId } },
      _count: { _all: true },
    }),
    prisma.organizerInvoice.findFirst({
      where: { eventId },
      orderBy: { generatedAt: "desc" },
      select: {
        id: true,
        invoiceType: true,
        currencySnapshot: true,
        approvedTicketCountSnapshot: true,
        unitPriceSnapshot: true,
        totalAmountSnapshot: true,
        totalAmount: true,
        amountPaid: true,
        paymentInstructionSnapshot: true,
        generatedAt: true,
        dueAt: true,
        status: true,
        paidAt: true,
        paymentNote: true,
        sentByEmailAt: true,
        sentByChatAt: true,
        emailError: true,
        chatError: true,
      },
    }),
  ]);

  const invoicePaymentEvidence = latestInvoice
    ? await listInvoicePaymentEvidence(latestInvoice.id)
    : [];

  const viewCountMap = new Map(viewCountsRaw.map((row) => [row.ticketId, row._count._all]));
  const scanSummary = {
    VALID: 0,
    USED: 0,
    INVALID: 0,
  };
  for (const row of scanSummaryRaw) {
    scanSummary[row.result] = row._count._all;
  }

  const deliverySummary = {
    sent: 0,
    failed: 0,
    unknown: 0,
  };
  for (const row of deliverySummaryRaw) {
    if (row.status === "SENT") deliverySummary.sent = row._count._all;
    else if (row.status === "FAILED") deliverySummary.failed = row._count._all;
    else deliverySummary.unknown += row._count._all;
  }

  const tickets = ticketsRaw.map((ticket) => {
    const latestDelivery = resolveLatestDelivery(ticket.deliveries);
    const openedCount = viewCountMap.get(ticket.id) || 0;
    return {
      ticketPublicId: ticket.ticketPublicId,
      attendeeName: null,
      attendeeEmail: latestDelivery?.email || null,
      ticketUrl: ticket.qrPayload || buildTicketUrl(ticket.ticketPublicId),
      deliveryStatus: latestDelivery?.status || "UNKNOWN",
      openedCount,
      opened: openedCount > 0,
      scanStatus: statusFromTicket(ticket),
      scannedAt: ticket.scannedAt,
      createdAt: ticket.createdAt,
      isInvalidated: ticket.isInvalidated,
      invalidatedAt: ticket.invalidatedAt,
      latestDelivery,
    };
  });

  res.json({
    event: {
      eventId: event.id,
      eventName: event.eventName,
      eventDate: event.eventDate,
      eventEndDate: event.eventEndDate,
      location: event.eventAddress,
      accessCode: event.accessCode,
      createdAt: event.createdAt,
      status: String(event.adminStatus || "ACTIVE").toLowerCase(),
      adminDisabledAt: event.adminDisabledAt,
      archivedAt: event.archivedAt,
      organizerAccessCode: event.organizerAccessCode || event.accessCode,
      invoiceEvidenceAutoApprove: Boolean(event.invoiceEvidenceAutoApprove),
      ticketsTotal: event._count.tickets,
      ticketsScanned: scannedCount,
      ticketsRemaining: Math.max(0, event._count.tickets - scannedCount - invalidatedCount),
      deliveriesSent: deliverySummary.sent,
      deliveriesFailed: deliverySummary.failed,
      lastScanAt: lastScan?.scannedAt || null,
    },
    configurationSnapshot: {
      title: event.eventName,
      date: event.eventDate,
      location: event.eventAddress,
      ticketsRequested: event.quantity,
      ticketType: event.ticketType,
      ticketPrice: event.ticketPrice,
      designJson: event.designJson,
      hasHeaderImage: Boolean(event.designJson && typeof event.designJson === "object" && event.designJson.headerImageDataUrl),
    },
    tickets,
    scanSummary,
    deliverySummary,
    invoice: latestInvoice
      ? {
          id: latestInvoice.id,
          invoiceType: latestInvoice.invoiceType,
          currency: latestInvoice.currencySnapshot,
          approvedTicketCount: latestInvoice.approvedTicketCountSnapshot,
          unitPrice: latestInvoice.unitPriceSnapshot,
          totalAmountSnapshot: latestInvoice.totalAmountSnapshot,
          totalAmount: latestInvoice.totalAmount,
          amountPaid: latestInvoice.amountPaid,
          amountRemaining: Number(latestInvoice.totalAmount) - Number(latestInvoice.amountPaid || 0),
          paymentInstructionSnapshot: latestInvoice.paymentInstructionSnapshot,
          generatedAt: latestInvoice.generatedAt,
          dueAt: latestInvoice.dueAt,
          status: latestInvoice.status,
          paidAt: latestInvoice.paidAt,
          paymentNote: latestInvoice.paymentNote,
          sentByEmailAt: latestInvoice.sentByEmailAt,
          sentByChatAt: latestInvoice.sentByChatAt,
          emailError: latestInvoice.emailError,
          chatError: latestInvoice.chatError,
          paymentEvidence: invoicePaymentEvidence,
        }
      : null,
  });
}

async function listAdminTickets(req, res) {
  const limit = normalizeLimit(req.query.limit, 100, 1, 300);
  const search = String(req.query.search || "").trim();

  const where = {
    ...(search
      ? {
          OR: [
            { ticketPublicId: { contains: search, mode: "insensitive" } },
            { event: { eventName: { contains: search, mode: "insensitive" } } },
            { event: { accessCode: { contains: search, mode: "insensitive" } } },
            { event: { organizerAccessCode: { contains: search, mode: "insensitive" } } },
            { deliveries: { some: { email: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
    ...(req.query.eventId ? { eventId: String(req.query.eventId) } : {}),
  };

  const rows = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      ticketPublicId: true,
      ticketType: true,
      ticketPrice: true,
      ticketRequestId: true,
      qrPayload: true,
      status: true,
      scannedAt: true,
      createdAt: true,
      isInvalidated: true,
      invalidatedAt: true,
      event: {
        select: {
          id: true,
          eventName: true,
          accessCode: true,
          organizerAccessCode: true,
          adminStatus: true,
          designJson: true,
        },
      },
      deliveries: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: {
          id: true,
          email: true,
          status: true,
          sentAt: true,
          errorMessage: true,
        },
      },
      _count: {
        select: {
          viewLogs: true,
        },
      },
    },
  });

  const items = rows.map((ticket) => {
    const latestDelivery = resolveLatestDelivery(ticket.deliveries);
    return {
      ticketPublicId: ticket.ticketPublicId,
      eventId: ticket.event.id,
      eventName: ticket.event.eventName,
      accessCode: ticket.event.accessCode,
      organizerAccessCode: ticket.event.organizerAccessCode || ticket.event.accessCode || null,
      ticketType: ticket.ticketType || null,
      currency: String(ticket.event?.designJson?.currency || "USD").toUpperCase(),
      price: ticket.ticketPrice,
      quantity: 1,
      sold: Boolean(ticket.ticketRequestId) || ticket.status === "USED",
      soldTickets: (Boolean(ticket.ticketRequestId) || ticket.status === "USED") ? 1 : 0,
      attendeeName: null,
      attendeeEmail: latestDelivery?.email || null,
      ticketUrl: ticket.qrPayload || buildTicketUrl(ticket.ticketPublicId),
      deliveryStatus: latestDelivery?.status || "UNKNOWN",
      openedCount: ticket._count.viewLogs,
      openedStatus: ticket._count.viewLogs > 0 ? "opened" : "not-opened",
      scanStatus: statusFromTicket(ticket),
      scannedAt: ticket.scannedAt,
      createdAt: ticket.createdAt,
      latestDeliveryId: latestDelivery?.id || null,
      eventStatus: ticket.event.adminStatus,
    };
  });

  res.json({ items });
}


async function listAdminScans(req, res) {
  const limit = normalizeLimit(req.query.limit, 100, 1, 300);
  const search = String(req.query.search || "").trim();
  const result = String(req.query.result || "").trim().toUpperCase();

  const where = {
    ...(search
      ? {
          OR: [
            { ticketPublicId: { contains: search, mode: "insensitive" } },
            { normalizedTicketPublicId: { contains: search, mode: "insensitive" } },
            { rawScannedValue: { contains: search, mode: "insensitive" } },
            { event: { eventName: { contains: search, mode: "insensitive" } } },
            { event: { accessCode: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(result && ["VALID", "USED", "INVALID"].includes(result) ? { result } : {}),
    ...buildDateWhere("scannedAt", req.query.dateFrom, req.query.dateTo),
  };

  const rows = await prisma.scanRecord.findMany({
    where,
    orderBy: { scannedAt: "desc" },
    take: limit,
    select: {
      id: true,
      scannedAt: true,
      ticketPublicId: true,
      rawScannedValue: true,
      normalizedTicketPublicId: true,
      scannerSource: true,
      note: true,
      result: true,
      event: {
        select: {
          id: true,
          eventName: true,
          accessCode: true,
          organizerAccessCode: true,
        },
      },
      ticket: {
        select: {
          deliveries: {
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { email: true },
          },
        },
      },
    },
  });

  const items = rows.map((row) => ({
    scanId: row.id,
    timestamp: row.scannedAt,
    eventId: row.event?.id || null,
    eventName: row.event?.eventName || "Unknown event",
    accessCode: row.event?.accessCode || "-",
    organizerAccessCode: row.event?.organizerAccessCode || row.event?.accessCode || "-",
    ticketPublicId: row.ticketPublicId,
    attendeeName: null,
    attendeeEmail: row.ticket?.deliveries?.[0]?.email || null,
    rawScannedValue: row.rawScannedValue,
    parsedValue: row.normalizedTicketPublicId,
    result: row.result,
    scannerSource: row.scannerSource,
    note: row.note,
  }));

  res.json({ items });
}

async function listAdminOrganizers(req, res) {
  const limit = normalizeLimit(req.query.limit, 200, 1, 500);
  const search = String(req.query.search || "").trim();

  const where = {
    organizerAccessCode: {
      not: null,
      notIn: [""],
    },
    ...(search
      ? {
          OR: [
            { organizerName: { contains: search, mode: "insensitive" } },
            { organizerAccessCode: { contains: search, mode: "insensitive" } },
            { eventName: { contains: search, mode: "insensitive" } },
            { accessCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.userEvent.findMany({
    where,
    orderBy: [{ organizerAccessCode: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      accessCode: true,
      organizerAccessCode: true,
      organizerName: true,
      organizerEmail: true,
      adminStatus: true,
      createdAt: true,
      _count: {
        select: {
          tickets: true,
          ticketRequests: true,
        },
      },
    },
  });

  const eventIds = rows.map((row) => row.id);
  const [usedGrouped, invalidatedGrouped, soldGrouped] = eventIds.length
    ? await Promise.all([
        prisma.ticket.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds }, status: "USED" },
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds }, isInvalidated: true },
          _count: { _all: true },
        }),
        prisma.ticket.groupBy({
          by: ["eventId"],
          where: {
            eventId: { in: eventIds },
            cancelledAt: null,
            ticketRequestId: { not: null },
            ticketRequest: { status: "APPROVED" },
          },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];

  const usedMap = new Map(usedGrouped.map((row) => [row.eventId, row._count._all]));
  const invalidatedMap = new Map(invalidatedGrouped.map((row) => [row.eventId, row._count._all]));
  const soldTicketsMap = new Map(soldGrouped.map((row) => [row.eventId, row._count._all]));
  const organizerMap = new Map();

  for (const event of rows) {
    const organizerAccessCode = String(event.organizerAccessCode || "").trim();
    if (!organizerAccessCode) continue;
    const usedCount = usedMap.get(event.id) || 0;
    const invalidatedCount = invalidatedMap.get(event.id) || 0;
    const soldTicketsCount = soldTicketsMap.get(event.id) || 0;
    const eventSummary = {
      eventId: event.id,
      eventName: event.eventName,
      eventDate: event.eventDate,
      location: event.eventAddress,
      accessCode: event.accessCode,
      organizerAccessCode,
      status: String(event.adminStatus || "ACTIVE").toLowerCase(),
      createdAt: event.createdAt,
      ticketsTotal: event._count.tickets,
      soldTickets: soldTicketsCount,
      ticketsUsed: usedCount,
      ticketsInvalidated: invalidatedCount,
      ticketRequestsTotal: event._count.ticketRequests,
    };

    const existing = organizerMap.get(organizerAccessCode) || {
      organizerAccessCode,
      organizerName: "",
      organizerEmail: "",
      eventsTotal: 0,
      ticketsTotal: 0,
      soldTickets: 0,
      ticketsUsed: 0,
      ticketsInvalidated: 0,
      ticketRequestsTotal: 0,
      latestEventCreatedAt: null,
      events: [],
    };

    existing.eventsTotal += 1;
    existing.ticketsTotal += eventSummary.ticketsTotal;
    existing.soldTickets += eventSummary.soldTickets;
    existing.ticketsUsed += eventSummary.ticketsUsed;
    existing.ticketsInvalidated += eventSummary.ticketsInvalidated;
    existing.ticketRequestsTotal += eventSummary.ticketRequestsTotal;
    if (!existing.latestEventCreatedAt || eventSummary.createdAt > existing.latestEventCreatedAt) {
      existing.latestEventCreatedAt = eventSummary.createdAt;
      // Use name/email from the latest event (most up-to-date)
      existing.organizerName = String(event.organizerName || "").trim();
      existing.organizerEmail = String(event.organizerEmail || "").trim();
    }
    existing.events.push(eventSummary);
    organizerMap.set(organizerAccessCode, existing);
  }

  const items = Array.from(organizerMap.values())
    .map((item) => ({
      ...item,
      events: item.events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }))
    .sort((a, b) => new Date(b.latestEventCreatedAt || 0).getTime() - new Date(a.latestEventCreatedAt || 0).getTime());

  res.json({ items });
}

async function listAdminInvoices(req, res) {
  const limit = normalizeLimit(req.query.limit, 200, 1, 500);
  const statusFilter = String(req.query.statusFilter || "ALL").trim().toUpperCase();
  const search = String(req.query.search || "").trim();
  const organizerEmailFilter = String(req.query.organizerEmail || "").trim();
  const organizerAccessCodeFilter = String(req.query.organizerAccessCode || "").trim();
  const eventDateFrom = parseDateBoundary(req.query.eventDateFrom, "start");
  const eventDateTo = parseDateBoundary(req.query.eventDateTo, "end");
  const autoApproveFilter = String(req.query.autoApprove || "ALL").trim().toUpperCase();

  let where = {};
  // Billing now uses a single post-event invoice only.
  where = { ...where, invoiceType: FINAL_INVOICE_TYPE };
  if (statusFilter === "OVERDUE") {
    where = { ...where, status: "OVERDUE" };
  } else if (statusFilter === "UNPAID") {
    where = { ...where, status: { in: ["SENT", "OVERDUE"] } };
  } else if (statusFilter === "BLOCKED") {
    where = { ...where, status: "BLOCKED_MISSING_INSTRUCTION" };
  }

  const eventWhere = {
    ...(search
      ? {
          OR: [
            { eventName: { contains: search, mode: "insensitive" } },
            { organizerName: { contains: search, mode: "insensitive" } },
            { organizerEmail: { contains: search, mode: "insensitive" } },
            { accessCode: { contains: search, mode: "insensitive" } },
            { organizerAccessCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(organizerEmailFilter ? { organizerEmail: { contains: organizerEmailFilter, mode: "insensitive" } } : {}),
    ...(organizerAccessCodeFilter
      ? {
          OR: [
            { accessCode: { contains: organizerAccessCodeFilter, mode: "insensitive" } },
            { organizerAccessCode: { contains: organizerAccessCodeFilter, mode: "insensitive" } },
          ],
        }
      : {}),
    ...((eventDateFrom || eventDateTo)
      ? {
          eventDate: {
            ...(eventDateFrom ? { gte: eventDateFrom } : {}),
            ...(eventDateTo ? { lte: eventDateTo } : {}),
          },
        }
      : {}),
    ...(autoApproveFilter === "ON"
      ? { invoiceEvidenceAutoApprove: true }
      : autoApproveFilter === "OFF"
        ? { invoiceEvidenceAutoApprove: false }
        : {}),
  };
  where = {
    ...where,
    ...((Object.keys(eventWhere).length > 0) ? { event: eventWhere } : {}),
  };

  const rows = await prisma.organizerInvoice.findMany({
    where,
    orderBy: [{ dueAt: "asc" }, { generatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      eventId: true,
      organizerEmailSnapshot: true,
      invoiceType: true,
      currencySnapshot: true,
      approvedTicketCountSnapshot: true,
      unitPriceSnapshot: true,
      totalAmountSnapshot: true,
      paymentInstructionSnapshot: true,
      totalAmount: true,
      amountPaid: true,
      status: true,
      dueAt: true,
      paidAt: true,
      generatedAt: true,
      sentByEmailAt: true,
      sentByChatAt: true,
      emailError: true,
      chatError: true,
      evidenceUploadAllowance: true,
      event: {
        select: {
          eventName: true,
          organizerName: true,
          organizerEmail: true,
          organizerAccessCode: true,
          accessCode: true,
          eventDate: true,
          eventEndDate: true,
          invoiceEvidenceAutoApprove: true,
        },
      },
      paymentEvidence: {
        orderBy: { submittedAt: "desc" },
        take: 5,
        select: {
          id: true,
          submittedAt: true,
          evidenceImageDataUrl: true,
          status: true,
        },
      },
      _count: {
        select: {
          paymentEvidence: {
            where: { status: "PENDING" },
          },
        },
      },
    },
  });

  const items = rows.map((row) => ({
    latestEvidence: (row.paymentEvidence || [])[0] || null,
    firstPendingEvidence: (row.paymentEvidence || []).find((item) => item.status === "PENDING") || null,
    rowData: row,
  })).map((mapped) => {
    const row = mapped.rowData;
    const latestEvidence = mapped.latestEvidence;
    const firstPendingEvidence = mapped.firstPendingEvidence;
    return {
    invoiceId: row.id,
    invoiceNumber: row.id,
    invoiceDateTime: row.generatedAt,
    eventId: row.eventId,
    eventName: row.event?.eventName || "Unknown event",
    eventDate: row.event?.eventDate || null,
    eventEndDate: row.event?.eventEndDate || null,
    eventAccessCode: row.event?.accessCode || null,
    organizerAccessCode: row.event?.organizerAccessCode || row.event?.accessCode || null,
    organizerName: row.event?.organizerName || null,
    organizerEmail: row.event?.organizerEmail || row.organizerEmailSnapshot || null,
    invoiceType: row.invoiceType,
    soldTickets: row.approvedTicketCountSnapshot,
    currency: row.currencySnapshot,
    unitPrice: row.unitPriceSnapshot,
    totalAmountSnapshot: row.totalAmountSnapshot,
    totalAmount: row.totalAmount,
    amountPaid: row.amountPaid,
    amountRemaining: Number(row.totalAmount) - Number(row.amountPaid || 0),
    paymentInstruction: row.paymentInstructionSnapshot || null,
    status: row.status,
    dueAt: row.dueAt,
    paidAt: row.paidAt,
    generatedAt: row.generatedAt,
    sentByEmailAt: row.sentByEmailAt,
    sentByChatAt: row.sentByChatAt,
    emailError: row.emailError || null,
    chatError: row.chatError || null,
    evidenceUploadAllowance: Number(row.evidenceUploadAllowance || 0),
    canUploadEvidence: Number(row.evidenceUploadAllowance || 0) > 0,
    invoiceEvidenceAutoApprove: Boolean(row.event?.invoiceEvidenceAutoApprove),
    pendingPaymentEvidenceCount: row._count?.paymentEvidence || 0,
    firstPendingPaymentEvidenceId: firstPendingEvidence?.id || null,
    firstPendingPaymentEvidenceSubmittedAt: firstPendingEvidence?.submittedAt || null,
    firstPendingPaymentEvidenceImageDataUrl: firstPendingEvidence?.evidenceImageDataUrl || null,
    latestEvidenceId: latestEvidence?.id || null,
    latestEvidenceSubmittedAt: latestEvidence?.submittedAt || null,
    latestEvidenceImageDataUrl: latestEvidence?.evidenceImageDataUrl || null,
  };
  });

  const summary = await prisma.userEvent.aggregate({
    _count: { _all: true },
    where: {
      ...(autoApproveFilter === "ON"
        ? { invoiceEvidenceAutoApprove: true }
        : autoApproveFilter === "OFF"
          ? { invoiceEvidenceAutoApprove: false }
          : {}),
    },
  });
  const autoApproveEnabledCount = await prisma.userEvent.count({ where: { invoiceEvidenceAutoApprove: true } });
  const unpaidEventGroups = await prisma.organizerInvoice.groupBy({
    by: ["eventId"],
    where: { invoiceType: FINAL_INVOICE_TYPE, status: { in: ["SENT", "OVERDUE"] } },
    _count: { eventId: true },
  });
  const unpaidEventCount = unpaidEventGroups.length;

  res.json({
    items,
    meta: {
      autoApproveEnabledCount,
      autoApproveDisabledCount: Math.max(0, (summary?._count?._all || 0) - autoApproveEnabledCount),
      unpaidEventCount,
    },
  });
}

async function getAdminSettings(_req, res) {
  const paymentInstructionRows = await prisma.adminCurrencyPaymentInstruction.findMany({
    select: { currency: true, instructionText: true, updatedAt: true },
    orderBy: { currency: "asc" },
  });
  const paymentInstructions = SUPPORTED_CURRENCIES.map((currency) => {
    const row = paymentInstructionRows.find((entry) => entry.currency === currency);
    return {
      currency,
      instructionText: row?.instructionText || "",
      updatedAt: row?.updatedAt || null,
    };
  });

  res.json({
    systemInfo: {
      appName: "QR Tickets",
      nodeEnv: process.env.NODE_ENV || "development",
      serverPort: Number.parseInt(String(process.env.PORT || "4100"), 10),
    },
    publicTicketBaseUrl: getPublicBaseUrl(),
    qrPayloadMode: "url-per-ticket-public-id",
    scanBehavior: {
      validScanMarksUsed: true,
      allowedResults: ["VALID", "USED", "INVALID"],
    },
    emailSender: {
      from: process.env.MAIL_FROM || "not-configured",
      smtpHostConfigured: Boolean(process.env.SMTP_HOST),
    },
    adminProtection: {
      strategy: "x-admin-key",
      configured: Boolean(resolveConfiguredAdminKey()),
      headerName: "x-admin-key",
    },
    paymentInstructions,
  });
}

async function getAdminPaymentInstructions(_req, res) {
  const rows = await prisma.adminCurrencyPaymentInstruction.findMany({
    select: { currency: true, instructionText: true, updatedAt: true },
    orderBy: { currency: "asc" },
  });

  const items = SUPPORTED_CURRENCIES.map((currency) => {
    const row = rows.find((entry) => entry.currency === currency);
    return {
      currency,
      instructionText: row?.instructionText || "",
      updatedAt: row?.updatedAt || null,
    };
  });

  res.json({ items });
}

async function lookupAdminOtpRecords(req, res) {
  const email = String(req.query?.email || "").trim().toLowerCase();
  const eventSlug = String(req.query?.eventSlug || "").trim();
  const limit = normalizeLimit(req.query?.limit, 25, 1, 100);

  if (!email) {
    res.status(400).json({ error: "email query parameter is required." });
    return;
  }

  const where = {
    email,
    ...(eventSlug ? { eventSlug } : {}),
  };

  const rows = await prisma.emailVerification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      email: true,
      eventSlug: true,
      code: true,
      attempts: true,
      verified: true,
      token: true,
      tokenUsed: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  const now = Date.now();
  const items = rows.map((row) => ({
    id: row.id,
    email: row.email,
    eventSlug: row.eventSlug,
    code: row.code,
    attempts: row.attempts,
    verified: row.verified,
    tokenUsed: row.tokenUsed,
    hasToken: Boolean(row.token),
    tokenPreview: row.token ? `${String(row.token).slice(0, 8)}...` : null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    isExpired: row.expiresAt ? new Date(row.expiresAt).getTime() <= now : true,
  }));

  res.json({ items });
}

async function patchAdminPaymentInstructions(req, res) {
  const payload = req.body && typeof req.body === "object" ? req.body : {};
  const updates = payload.instructions && typeof payload.instructions === "object" ? payload.instructions : null;
  if (!updates) {
    res.status(400).json({ error: "instructions object is required." });
    return;
  }

  const normalized = [];
  for (const currency of SUPPORTED_CURRENCIES) {
    if (!(currency in updates)) continue;
    const instructionText = String(updates[currency] || "").trim();
    if (!instructionText) {
      res.status(400).json({ error: `${currency} instruction is required when provided.` });
      return;
    }
    if (instructionText.length > 2000) {
      res.status(400).json({ error: `${currency} instruction is too long.` });
      return;
    }
    normalized.push({ currency, instructionText });
  }

  if (!normalized.length) {
    res.status(400).json({ error: "At least one supported currency instruction must be provided." });
    return;
  }

  await prisma.$transaction(
    normalized.map((entry) =>
      prisma.adminCurrencyPaymentInstruction.upsert({
        where: { currency: entry.currency },
        create: {
          currency: entry.currency,
          instructionText: entry.instructionText,
        },
        update: {
          instructionText: entry.instructionText,
        },
      }),
    ),
  );

  await writeAdminAuditLog({
    action: "admin.updated-payment-instructions",
    targetType: "settings",
    targetId: "payment-instructions",
    metadata: {
      updatedCurrencies: normalized.map((entry) => entry.currency),
    },
  });

  const rows = await prisma.adminCurrencyPaymentInstruction.findMany({
    select: { currency: true, instructionText: true, updatedAt: true },
    orderBy: { currency: "asc" },
  });
  const items = SUPPORTED_CURRENCIES.map((currency) => {
    const row = rows.find((entry) => entry.currency === currency);
    return {
      currency,
      instructionText: row?.instructionText || "",
      updatedAt: row?.updatedAt || null,
    };
  });

  res.json({ items });
}

async function listAdminAuditLog(req, res) {
  const limit = normalizeLimit(req.query.limit, 100, 1, 300);
  const search = String(req.query.search || "").trim();

  const where = search
    ? {
        OR: [
          { action: { contains: search, mode: "insensitive" } },
          { targetType: { contains: search, mode: "insensitive" } },
          { targetId: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const rows = await prisma.adminAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      event: {
        select: {
          id: true,
          eventName: true,
          accessCode: true,
        },
      },
    },
  });

  const items = rows.map((row) => ({
    logId: row.id,
    timestamp: row.createdAt,
    adminAction: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata,
    event: row.event,
  }));

  res.json({ items });
}

async function listAdminClientDashTokens(req, res) {
  const limit = normalizeLimit(req.query.limit, 200, 1, 500);
  const search = String(req.query.search || "").trim();

  const where = {
    ...(search
      ? {
          OR: [
            { clientProfile: { clientAccessToken: { contains: search, mode: "insensitive" } } },
            { event: { accessCode: { contains: search, mode: "insensitive" } } },
            { event: { eventName: { contains: search, mode: "insensitive" } } },
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.ticketRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      clientProfile: { select: { clientAccessToken: true } },
      status: true,
      createdAt: true,
      name: true,
      email: true,
      event: {
        select: {
          id: true,
          eventName: true,
          accessCode: true,
        },
      },
    },
  });

  const baseUrl = getPublicBaseUrl();
  const items = rows.map((row) => {
    const token = row.clientProfile?.clientAccessToken || null;
    return {
      requestId: row.id,
      eventId: row.event?.id || null,
      eventName: row.event?.eventName || "Unknown event",
      eventCode: row.event?.accessCode || "-",
      buyerName: row.name || "-",
      buyerEmail: row.email || "-",
      status: row.status,
      clientAccessToken: token,
      clientDashboardUrl: token ? `${baseUrl}/client/${token}` : null,
      createdAt: row.createdAt,
    };
  });

  res.json({ items });
}

async function patchEventStatus(req, res, nextStatus, actionName) {
  const eventId = String(req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }

  const existing = await prisma.userEvent.findUnique({ where: { id: eventId } });
  if (!existing) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const updated = await prisma.userEvent.update({
    where: { id: eventId },
    data: {
      adminStatus: nextStatus,
      adminDisabledAt: nextStatus === "DISABLED" ? new Date() : null,
      archivedAt: nextStatus === "ARCHIVED" ? new Date() : existing.archivedAt,
    },
    select: {
      id: true,
      eventName: true,
      accessCode: true,
      adminStatus: true,
      adminDisabledAt: true,
      archivedAt: true,
    },
  });

  await writeAdminAuditLog({
    action: actionName,
    targetType: "event",
    targetId: updated.id,
    eventId: updated.id,
    metadata: {
      accessCode: updated.accessCode,
      status: updated.adminStatus,
    },
  });

  res.json({ event: updated });
}

async function disableAdminEvent(req, res) {
  await patchEventStatus(req, res, "DISABLED", "admin.disabled-event");
}

async function enableAdminEvent(req, res) {
  await patchEventStatus(req, res, "ACTIVE", "admin.enabled-event");
}

async function archiveAdminEvent(req, res) {
  await patchEventStatus(req, res, "ARCHIVED", "admin.archived-event");
}

async function rotateAdminEventAccessCode(req, res) {
  const eventId = String(req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }

  const existing = await prisma.userEvent.findUnique({ where: { id: eventId } });
  if (!existing) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const accessCode = await generateAccessCode(async (candidate) => {
    const row = await prisma.userEvent.findUnique({ where: { accessCode: candidate } });
    return !row;
  });

  const updated = await prisma.userEvent.update({
    where: { id: eventId },
    data: { accessCode },
    select: { id: true, eventName: true, accessCode: true },
  });

  await writeAdminAuditLog({
    action: "admin.rotated-access-code",
    targetType: "event",
    targetId: updated.id,
    eventId: updated.id,
    metadata: {
      previousAccessCode: existing.accessCode,
      nextAccessCode: updated.accessCode,
    },
  });

  res.json({ event: updated });
}

async function patchScannerLocked(req, res, locked) {
  const eventId = String(req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }
  const existing = await prisma.userEvent.findUnique({ where: { id: eventId } });
  if (!existing) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  const updated = await prisma.userEvent.update({
    where: { id: eventId },
    data: { scannerLocked: locked },
    select: { id: true, eventName: true, accessCode: true, scannerLocked: true },
  });
  await writeAdminAuditLog({
    action: locked ? "admin.locked-scanner" : "admin.unlocked-scanner",
    targetType: "event",
    targetId: updated.id,
    eventId: updated.id,
    metadata: { accessCode: updated.accessCode, scannerLocked: locked },
  });
  res.json({ event: updated });
}

async function lockAdminScanner(req, res) {
  await patchScannerLocked(req, res, true);
}

async function unlockAdminScanner(req, res) {
  await patchScannerLocked(req, res, false);
}

async function invalidateAdminTicket(req, res) {
  const ticketPublicId = String(req.params.ticketPublicId || "").trim();
  if (!ticketPublicId) {
    res.status(400).json({ error: "ticketPublicId is required." });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { ticketPublicId },
    select: { id: true, eventId: true, ticketPublicId: true, isInvalidated: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  const updated = await prisma.ticket.update({
    where: { ticketPublicId },
    data: {
      isInvalidated: true,
      invalidatedAt: new Date(),
    },
    select: {
      ticketPublicId: true,
      status: true,
      isInvalidated: true,
      invalidatedAt: true,
    },
  });

  await writeAdminAuditLog({
    action: "admin.invalidated-ticket",
    targetType: "ticket",
    targetId: updated.ticketPublicId,
    eventId: ticket.eventId,
    metadata: {
      previousInvalidatedState: ticket.isInvalidated,
      nextInvalidatedState: true,
    },
  });

  res.json({ ticket: updated });
}

async function restoreAdminTicket(req, res) {
  const ticketPublicId = String(req.params.ticketPublicId || "").trim();
  if (!ticketPublicId) {
    res.status(400).json({ error: "ticketPublicId is required." });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { ticketPublicId },
    select: { id: true, eventId: true, isInvalidated: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  const updated = await prisma.ticket.update({
    where: { ticketPublicId },
    data: {
      isInvalidated: false,
      invalidatedAt: null,
    },
    select: {
      ticketPublicId: true,
      status: true,
      isInvalidated: true,
      invalidatedAt: true,
    },
  });

  await writeAdminAuditLog({
    action: "admin.restored-ticket",
    targetType: "ticket",
    targetId: updated.ticketPublicId,
    eventId: ticket.eventId,
    metadata: {
      previousInvalidatedState: ticket.isInvalidated,
      nextInvalidatedState: false,
    },
  });

  res.json({ ticket: updated });
}

async function resetAdminTicketUsage(req, res) {
  const ticketPublicId = String(req.params.ticketPublicId || "").trim();
  if (!ticketPublicId) {
    res.status(400).json({ error: "ticketPublicId is required." });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { ticketPublicId },
    select: { id: true, eventId: true, status: true, scannedAt: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  const updated = await prisma.ticket.update({
    where: { ticketPublicId },
    data: {
      status: "UNUSED",
      scannedAt: null,
    },
    select: {
      ticketPublicId: true,
      status: true,
      scannedAt: true,
      isInvalidated: true,
    },
  });

  await writeAdminAuditLog({
    action: "admin.reset-ticket-usage",
    targetType: "ticket",
    targetId: updated.ticketPublicId,
    eventId: ticket.eventId,
    metadata: {
      previousStatus: ticket.status,
      previousScannedAt: ticket.scannedAt,
      nextStatus: updated.status,
    },
  });

  res.json({ ticket: updated });
}


async function markScanSuspicious(req, res) {
  const scanId = String(req.params.scanId || "").trim();
  const note = String(req.body?.note || "").trim();
  if (!scanId) {
    res.status(400).json({ error: "scanId is required." });
    return;
  }

  const existing = await prisma.scanRecord.findUnique({
    where: { id: scanId },
    select: { id: true, eventId: true, note: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Scan not found." });
    return;
  }

  const suspiciousNote = `SUSPICIOUS${note ? `: ${note}` : ""}`;
  const updated = await prisma.scanRecord.update({
    where: { id: scanId },
    data: { note: suspiciousNote },
    select: {
      id: true,
      note: true,
      scannedAt: true,
      result: true,
    },
  });

  await writeAdminAuditLog({
    action: "admin.marked-scan-suspicious",
    targetType: "scan",
    targetId: updated.id,
    eventId: existing.eventId,
    metadata: {
      previousNote: existing.note,
      nextNote: updated.note,
    },
  });

  res.json({ scan: updated });
}

async function markAdminInvoicePaid(req, res) {
  const invoiceId = String(req.params.invoiceId || "").trim();
  if (!invoiceId) {
    res.status(400).json({ error: "invoiceId is required." });
    return;
  }
  const paymentNote = String(req.body?.paymentNote || "").trim();
  try {
    const updated = await markInvoicePaid(invoiceId, { paymentNote });
    await writeAdminAuditLog({
      action: "admin.marked-invoice-paid",
      targetType: "invoice",
      targetId: updated.id,
      eventId: updated.eventId,
      metadata: {
        status: updated.status,
        paidAt: updated.paidAt,
        hasPaymentNote: Boolean(updated.paymentNote),
      },
    });
    res.json({ invoice: updated });
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "BAD_INPUT" || code === "INVALID_TRANSITION") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
}

async function addAdminInvoicePayment(req, res) {
  const invoiceId = String(req.params.invoiceId || "").trim();
  if (!invoiceId) {
    res.status(400).json({ error: "invoiceId is required." });
    return;
  }
  const paymentNote = String(req.body?.paymentNote || "").trim();
  const paymentAmountRaw = req.body?.paymentAmount ?? req.body?.amount;
  const paymentAmount = Number(paymentAmountRaw);
  if (!Number.isFinite(paymentAmount)) {
    res.status(400).json({ error: "paymentAmount must be a valid number." });
    return;
  }

  try {
    const updated = await addInvoicePayment(invoiceId, { paymentAmount, paymentNote });
    await writeAdminAuditLog({
      action: "admin.added-invoice-payment",
      targetType: "invoice",
      targetId: updated.id,
      eventId: updated.eventId,
      metadata: {
        status: updated.status,
        paymentAdded: updated.paymentAdded,
        amountPaid: updated.amountPaid,
        amountRemaining: updated.amountRemaining,
        paidAt: updated.paidAt,
        hasPaymentNote: Boolean(updated.paymentNote),
      },
    });
    res.json({ invoice: updated });
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "BAD_INPUT" || code === "INVALID_TRANSITION") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
}

async function retryAdminInvoiceDelivery(req, res) {
  const invoiceId = String(req.params.invoiceId || "").trim();
  if (!invoiceId) {
    res.status(400).json({ error: "invoiceId is required." });
    return;
  }
  try {
    const updated = await retryInvoiceDelivery(invoiceId);
    await writeAdminAuditLog({
      action: "admin.retried-invoice-delivery",
      targetType: "invoice",
      targetId: updated.id,
      eventId: updated.eventId,
      metadata: {
        status: updated.status,
        sentByEmailAt: updated.sentByEmailAt,
        sentByChatAt: updated.sentByChatAt,
        emailError: updated.emailError,
        chatError: updated.chatError,
      },
    });
    res.json({ invoice: updated });
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "BAD_INPUT" || code === "INVALID_TRANSITION") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (code === "MISSING_INSTRUCTION") {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
}

async function approveAdminInvoicePaymentEvidence(req, res) {
  const evidenceId = String(req.params.evidenceId || "").trim();
  if (!evidenceId) {
    res.status(400).json({ error: "evidenceId is required." });
    return;
  }
  try {
    const result = await approveInvoicePaymentEvidence(evidenceId, { reviewedBy: "ADMIN" });
    await writeAdminAuditLog({
      action: "admin.approved-invoice-payment-evidence",
      targetType: "invoice-payment-evidence",
      targetId: result.evidence.id,
      eventId: result.evidence.eventId,
      metadata: {
        invoiceId: result.evidence.invoiceId,
        evidenceStatus: result.evidence.status,
        invoiceStatus: result.invoice?.status || null,
      },
    });
    res.json(result);
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "BAD_INPUT" || code === "INVALID_TRANSITION") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
}

async function sendAdminEvidenceNotifyTest(_req, res) {
  await sendAdminInvoiceEvidenceSubmittedEmail({
    organizerName: "Test Organizer",
    organizerEmail: "organizer@example.com",
    organizerAccessCode: "TESTORGCODE",
    eventName: "Test Event",
    eventId: "test-event-id",
    invoiceId: "test-invoice-id",
    submittedAt: new Date(),
  });
  res.json({ ok: true });
}

async function patchAdminInvoiceEvidenceAutoApprove(req, res) {
  const eventId = String(req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }
  const enabled = Boolean(req.body?.enabled);
  const event = await prisma.userEvent.findUnique({
    where: { id: eventId },
    select: { id: true, accessCode: true, organizerAccessCode: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  const organizerAccessCode = String(event.organizerAccessCode || event.accessCode || "").trim();
  if (!organizerAccessCode) {
    res.status(400).json({ error: "Organizer access code is missing for this event." });
    return;
  }

  const updated = await setOrganizerInvoiceEvidenceAutoApprove(organizerAccessCode, enabled);
  await writeAdminAuditLog({
    action: "admin.updated-invoice-evidence-auto-approve",
    targetType: "organizer-billing-setting",
    targetId: organizerAccessCode,
    eventId,
    metadata: {
      enabled: updated.enabled,
      updatedEvents: updated.updatedEvents,
    },
  });
  res.json(updated);
}

async function patchAdminGlobalInvoiceEvidenceAutoApprove(req, res) {
  const enabled = Boolean(req.body?.enabled);
  const result = await prisma.userEvent.updateMany({
    data: {
      invoiceEvidenceAutoApprove: enabled,
    },
  });
  await writeAdminAuditLog({
    action: "admin.updated-global-invoice-evidence-auto-approve",
    targetType: "organizer-billing-setting-global",
    targetId: "all-organizers",
    metadata: {
      enabled,
      updatedEvents: result.count || 0,
    },
  });
  res.json({ enabled, updatedEvents: result.count || 0 });
}

async function patchAdminAllowInvoiceEvidenceAttachment(req, res) {
  const invoiceId = String(req.params.invoiceId || "").trim();
  if (!invoiceId) {
    res.status(400).json({ error: "invoiceId is required." });
    return;
  }
  try {
    const updated = await allowInvoiceEvidenceAttachment(invoiceId);
    await writeAdminAuditLog({
      action: "admin.allowed-invoice-evidence-attachment",
      targetType: "invoice",
      targetId: updated.invoiceId,
      eventId: updated.eventId,
      metadata: {
        evidenceUploadAllowance: updated.evidenceUploadAllowance,
      },
    });
    res.json(updated);
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "BAD_INPUT") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (code === "NOT_FOUND") {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
}

module.exports = {
  getAdminOverview,
  listAdminEvents,
  getAdminEventDetail,
  listAdminTickets,
  listAdminScans,
  listAdminOrganizers,
  listAdminInvoices,
  getAdminSettings,
  getAdminPaymentInstructions,
  lookupAdminOtpRecords,
  patchAdminPaymentInstructions,
  listAdminAuditLog,
  listAdminClientDashTokens,
  disableAdminEvent,
  enableAdminEvent,
  archiveAdminEvent,
  rotateAdminEventAccessCode,
  lockAdminScanner,
  unlockAdminScanner,
  invalidateAdminTicket,
  restoreAdminTicket,
  resetAdminTicketUsage,
  markScanSuspicious,
  markAdminInvoicePaid,
  addAdminInvoicePayment,
  retryAdminInvoiceDelivery,
  approveAdminInvoicePaymentEvidence,
  sendAdminEvidenceNotifyTest,
  patchAdminInvoiceEvidenceAutoApprove,
  patchAdminGlobalInvoiceEvidenceAutoApprove,
  patchAdminAllowInvoiceEvidenceAttachment,
};
