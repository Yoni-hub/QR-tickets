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
      isInvalidated: true,
      cancelledAt: true,
      cancellationReason: true,
      cancellationOtherReason: true,
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
          eventEndDate: true,
          eventAddress: true,
          accessCode: true,
          isDemo: true,
          adminStatus: true,
          designJson: true,
          emailVerified: true,
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

  // Resolve price: prefer ticket-level ticketPrice, fall back to matching group in event designJson
  const currency = String(ticket.event.designJson?.currency || "$").trim();
  let resolvedPrice = ticket.ticketPrice != null ? Number(ticket.ticketPrice) : null;
  if (resolvedPrice == null) {
    const groups = Array.isArray(ticket.event.designJson?.ticketGroups) ? ticket.event.designJson.ticketGroups : [];
    const matchingGroup = groups.find((g) => String(g.ticketType || "").trim() === String(ticket.ticketType || "").trim());
    if (matchingGroup?.ticketPrice != null) {
      resolvedPrice = Number(matchingGroup.ticketPrice);
    }
  }
  let ticketOut = ticket;
  const designJsonBase = ticket.designJson && typeof ticket.designJson === "object" ? ticket.designJson : {};
  const priceText = resolvedPrice != null && Number.isFinite(resolvedPrice) && resolvedPrice > 0
    ? `${currency}${resolvedPrice.toFixed(2)}`
    : "Free";
  ticketOut = { ...ticket, designJson: { ...designJsonBase, priceText, currency } };

  // Strip event.designJson and internal fields from the response
  const { designJson: _eventDesign, emailVerified: _emailVerified, ...eventOut } = ticket.event;
  ticketOut = { ...ticketOut, event: eventOut };

  res.json({ ticket: ticketOut, order, published: ticket.event.emailVerified === true });
}

async function getPublicTicketByPublicId(req, res) {
  return getTicketByPublicId(req, res);
}

module.exports = { getTicketByPublicId, getPublicTicketByPublicId };
