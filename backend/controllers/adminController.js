const prisma = require("../utils/prisma");
const { generateAccessCode } = require("../utils/accessCode");
const { getPublicBaseUrl } = require("../services/eventService");
const { resolveConfiguredAdminKey } = require("../middleware/adminAuth");
const { writeAdminAuditLog } = require("../utils/adminAudit");

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
      eventAddress: true,
      accessCode: true,
      createdAt: true,
      adminStatus: true,
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
      location: row.eventAddress,
      accessCode: row.accessCode,
      ticketsTotal,
      ticketsScanned,
      ticketsRemaining: Math.max(0, ticketsTotal - ticketsScanned - invalidatedCount),
      createdAt: row.createdAt,
      status: String(row.adminStatus || "ACTIVE").toLowerCase(),
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
      eventAddress: true,
      accessCode: true,
      createdAt: true,
      designJson: true,
      quantity: true,
      ticketType: true,
      ticketPrice: true,
      adminStatus: true,
      adminDisabledAt: true,
      archivedAt: true,
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
  ]);

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
      location: event.eventAddress,
      accessCode: event.accessCode,
      createdAt: event.createdAt,
      status: String(event.adminStatus || "ACTIVE").toLowerCase(),
      adminDisabledAt: event.adminDisabledAt,
      archivedAt: event.archivedAt,
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
          adminStatus: true,
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
  const [usedGrouped, invalidatedGrouped] = eventIds.length
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

  const usedMap = new Map(usedGrouped.map((row) => [row.eventId, row._count._all]));
  const invalidatedMap = new Map(invalidatedGrouped.map((row) => [row.eventId, row._count._all]));
  const organizerMap = new Map();

  for (const event of rows) {
    const organizerAccessCode = String(event.organizerAccessCode || "").trim();
    if (!organizerAccessCode) continue;
    const usedCount = usedMap.get(event.id) || 0;
    const invalidatedCount = invalidatedMap.get(event.id) || 0;
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
      ticketsUsed: 0,
      ticketsInvalidated: 0,
      ticketRequestsTotal: 0,
      latestEventCreatedAt: null,
      events: [],
    };

    existing.eventsTotal += 1;
    existing.ticketsTotal += eventSummary.ticketsTotal;
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

async function getAdminSettings(_req, res) {
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
      from: process.env.MAIL_FROM || "no-reply@localhost",
      smtpHostConfigured: Boolean(process.env.SMTP_HOST),
    },
    adminProtection: {
      strategy: "x-admin-key",
      configured: Boolean(resolveConfiguredAdminKey()),
      headerName: "x-admin-key",
    },
  });
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

module.exports = {
  getAdminOverview,
  listAdminEvents,
  getAdminEventDetail,
  listAdminTickets,
  listAdminScans,
  listAdminOrganizers,
  getAdminSettings,
  listAdminAuditLog,
  listAdminClientDashTokens,
  disableAdminEvent,
  enableAdminEvent,
  archiveAdminEvent,
  rotateAdminEventAccessCode,
  invalidateAdminTicket,
  restoreAdminTicket,
  resetAdminTicketUsage,
  markScanSuspicious,
};
