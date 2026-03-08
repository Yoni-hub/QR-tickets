const prisma = require("../utils/prisma");

async function getPublicEventBySlug(req, res) {
  const eventSlug = String(req.params.eventSlug || "").trim();
  if (!eventSlug) {
    res.status(400).json({ error: "eventSlug is required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({
    where: { slug: eventSlug },
    select: {
      id: true,
      slug: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      ticketPrice: true,
      paymentInstructions: true,
      adminStatus: true,
      accessCode: true,
      _count: { select: { tickets: true } },
    },
  });

  if (!event || event.adminStatus !== "ACTIVE") {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const [usedCount, pendingRequests, promoters] = await Promise.all([
    prisma.ticket.count({ where: { eventId: event.id, status: "USED" } }),
    prisma.ticketRequest.aggregate({
      where: { eventId: event.id, status: "PENDING_PAYMENT" },
      _sum: { quantity: true },
    }),
    prisma.promoter.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const requestsReserved = Number(pendingRequests._sum.quantity || 0);
  const ticketsRemaining = Math.max(0, Number(event._count.tickets || 0) - usedCount - requestsReserved);

  res.json({
    event: {
      eventId: event.id,
      slug: event.slug,
      eventName: event.eventName,
      eventDate: event.eventDate,
      location: event.eventAddress,
      price: event.ticketPrice,
      paymentInstructions: event.paymentInstructions,
      ticketsRemaining,
    },
    promoters,
  });
}

async function createPublicTicketRequest(req, res) {
  const eventSlug = String(req.body?.eventSlug || "").trim();
  const name = String(req.body?.name || "").trim();
  const phone = String(req.body?.phone || "").trim() || null;
  const email = String(req.body?.email || "").trim().toLowerCase() || null;
  const quantity = Math.max(1, Number.parseInt(String(req.body?.quantity || "1"), 10) || 1);
  const promoterCode = String(req.body?.promoterCode || "").trim().toLowerCase();

  if (!eventSlug || !name) {
    res.status(400).json({ error: "eventSlug and name are required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({
    where: { slug: eventSlug },
    select: { id: true, slug: true, eventName: true, paymentInstructions: true, adminStatus: true },
  });

  if (!event || event.adminStatus !== "ACTIVE") {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  let promoter = null;
  if (promoterCode) {
    promoter = await prisma.promoter.findFirst({ where: { eventId: event.id, code: promoterCode } });
  }

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
    select: {
      id: true,
      status: true,
      quantity: true,
      promoter: { select: { name: true, code: true } },
      event: { select: { slug: true, paymentInstructions: true, eventName: true } },
    },
  });

  res.status(201).json({
    request,
    instructions:
      request.event.paymentInstructions ||
      "Send payment using the organizer instructions and wait for approval.",
  });
}

module.exports = {
  getPublicEventBySlug,
  createPublicTicketRequest,
};