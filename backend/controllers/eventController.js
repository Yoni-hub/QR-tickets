const prisma = require("../utils/prisma");
const { createEvent } = require("../services/eventService");

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

  const event = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      accessCode: true,
      isDemo: true,
      createdAt: true,
    },
  });

  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const totalTickets = await prisma.ticket.count({ where: { eventId: event.id } });
  const scannedTickets = await prisma.ticket.count({ where: { eventId: event.id, status: "USED" } });

  const scans = await prisma.scanRecord.findMany({
    where: { eventId: event.id },
    orderBy: { scannedAt: "desc" },
    take: 100,
    select: { ticketPublicId: true, result: true, scannedAt: true },
  });

  res.json({
    event,
    totalTickets,
    scannedTickets,
    remainingTickets: totalTickets - scannedTickets,
    scans,
  });
}

async function getEventTickets(req, res) {
  const eventId = (req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }

  const tickets = await prisma.ticket.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: { ticketPublicId: true, status: true, scannedAt: true },
  });

  res.json({ eventId, tickets });
}

module.exports = {
  createLiveEvent,
  createDemoEvent,
  getEventByCode,
  getEventTickets,
};
