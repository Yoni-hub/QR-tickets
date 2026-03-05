const prisma = require("../utils/prisma");

async function getTicketByPublicId(req, res) {
  const ticketPublicId = (req.params.ticketPublicId || "").trim();
  if (!ticketPublicId) {
    res.status(400).json({ error: "ticketPublicId is required." });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { ticketPublicId },
    select: {
      id: true,
      ticketPublicId: true,
      qrPayload: true,
      status: true,
      scannedAt: true,
      createdAt: true,
      event: {
        select: {
          id: true,
          eventName: true,
          eventDate: true,
          eventAddress: true,
          accessCode: true,
          isDemo: true,
        },
      },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  const order = {
    eventId: ticket.event.id,
    accessCode: ticket.event.accessCode,
    status: "ACTIVE",
  };

  res.json({ ticket, order });
}

async function getPublicTicketByPublicId(req, res) {
  return getTicketByPublicId(req, res);
}

module.exports = { getTicketByPublicId, getPublicTicketByPublicId };

