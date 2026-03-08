const prisma = require("../utils/prisma");
const { generateTicketPublicId } = require("../utils/ticketPublicId");
const { buildQrPayload, getPublicBaseUrl } = require("../services/eventService");
const { sendTicketLinkEmail } = require("../utils/mailer");
const { sendTicketSms } = require("../utils/sms");

function parseAccessCode(value) {
  return String(value || "").trim();
}

async function findEventByAccessCode(accessCode) {
  if (!accessCode) return null;
  const event = await prisma.userEvent.findUnique({ where: { accessCode } });
  if (!event) return null;
  if (event.slug) return event;

  const fallbackSlug = `${String(event.eventName || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50) || "event"}-${String(event.id).slice(-6)}`;

  return prisma.userEvent.update({
    where: { id: event.id },
    data: { slug: fallbackSlug },
  });
}

async function getOrganizerTicketRequests(req, res) {
  const accessCode = parseAccessCode(req.query?.accessCode || req.params?.accessCode);
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const event = await findEventByAccessCode(accessCode);
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
      quantity: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      promoter: { select: { id: true, name: true, code: true } },
      _count: { select: { tickets: true } },
    },
  });

  res.json({
    event: {
      id: event.id,
      eventName: event.eventName,
      slug: event.slug,
      accessCode: event.accessCode,
    },
    items: requests,
  });
}

async function createTicketsForRequest({ event, request }) {
  const ids = new Set();
  const rows = [];

  for (let index = 0; index < request.quantity; index += 1) {
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
      attendeeName: request.name,
      attendeePhone: request.phone,
      attendeeEmail: request.email,
      promoterId: request.promoterId,
      ticketRequestId: request.id,
    });
  }

  await prisma.ticket.createMany({ data: rows });

  const tickets = await prisma.ticket.findMany({
    where: { ticketRequestId: request.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, ticketPublicId: true, qrPayload: true },
  });

  return tickets;
}

async function deliverApprovedTickets({ event, request, tickets }) {
  const firstTicketUrl = tickets[0]?.qrPayload || `${getPublicBaseUrl()}/t/${tickets[0]?.ticketPublicId || ""}`;

  if (request.email) {
    try {
      await sendTicketLinkEmail({
        to: request.email,
        eventName: event.eventName,
        eventDate: event.eventDate,
        eventAddress: event.eventAddress,
        ticketType: event.ticketType || "General",
        ticketUrl: firstTicketUrl,
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

  const event = await findEventByAccessCode(accessCode);
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

  const tickets = await createTicketsForRequest({ event, request });

  const updatedRequest = await prisma.ticketRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED" },
    select: {
      id: true,
      status: true,
      quantity: true,
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

  const event = await findEventByAccessCode(accessCode);
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

  const event = await findEventByAccessCode(accessCode);
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

  const event = await findEventByAccessCode(accessCode);
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

  const event = await findEventByAccessCode(accessCode);
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

  const event = await findEventByAccessCode(accessCode);
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

  const event = await findEventByAccessCode(accessCode);
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

  const event = await findEventByAccessCode(accessCode);
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
  listPromoters,
  createPromoter,
  updatePromoter,
  deletePromoter,
  createGuestAndApprove,
  bulkGuestImport,
};
