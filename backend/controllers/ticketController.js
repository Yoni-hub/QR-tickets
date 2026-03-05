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
      ticketPublicId: true,
      status: true,
      scannedAt: true,
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

  res.json({ ticket });
}

module.exports = { getTicketByPublicId };
