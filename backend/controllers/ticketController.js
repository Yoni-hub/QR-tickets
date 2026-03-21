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
      attendeeName: true,
      attendeePhone: true,
      attendeeEmail: true,
      ticketType: true,
      ticketPrice: true,
      designJson: true,
      status: true,
      scannedAt: true,
      createdAt: true,
      promoter: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      ticketRequest: {
        select: {
          id: true,
          quantity: true,
          status: true,
        },
      },
      event: {
        select: {
          id: true,
          eventName: true,
          eventDate: true,
          eventAddress: true,
          accessCode: true,
          isDemo: true,
          adminStatus: true,
          designJson: true,
        },
      },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  const source = String(req.query?.source || "public-page").trim() || "public-page";
  const userAgent = String(req.header("user-agent") || "").slice(0, 500) || null;
  const forwardedFor = String(req.header("x-forwarded-for") || "").split(",")[0].trim();
  const ipAddress = forwardedFor || req.ip || null;
  prisma.ticketViewLog
    .create({
      data: {
        ticketId: ticket.id,
        source,
        userAgent,
        ipAddress,
      },
    })
    .catch((error) => {
      console.error("ticket view log write failed", error);
    });

  const order = {
    eventId: ticket.event.id,
    accessCode: ticket.event.accessCode,
    status: ticket.event.adminStatus === "ACTIVE" ? "ACTIVE" : "DISABLED",
  };

  // Override priceText in ticket designJson using the event's current currency setting
  const currency = String(ticket.event.designJson?.currency || "$").trim();
  let ticketOut = ticket;
  if (ticket.designJson && typeof ticket.designJson === "object") {
    const price = ticket.ticketPrice != null ? Number(ticket.ticketPrice) : null;
    const priceText = price != null && Number.isFinite(price) && price > 0
      ? `${currency}${price.toFixed(2)}`
      : ticket.designJson.priceText || "Free";
    ticketOut = { ...ticket, designJson: { ...ticket.designJson, priceText, currency } };
  }

  // Strip event.designJson from the response (internal data)
  const { designJson: _eventDesign, ...eventOut } = ticket.event;
  ticketOut = { ...ticketOut, event: eventOut };

  res.json({ ticket: ticketOut, order });
}

async function getPublicTicketByPublicId(req, res) {
  return getTicketByPublicId(req, res);
}

module.exports = { getTicketByPublicId, getPublicTicketByPublicId };
