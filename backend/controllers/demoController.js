const prisma = require("../utils/prisma");
const { generateAccessCode } = require("../utils/accessCode");
const { generateTicketPublicId } = require("../utils/ticketPublicId");

function parseQuantity(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, 500);
}

async function createDemoEvent(req, res) {
  try {
    const {
      eventName,
      eventDateTime,
      eventAddress,
      ticketType,
      ticketPrice,
      quantity,
    } = req.body || {};

    const resolvedName = (eventName || "QR Tickets Demo Event").trim();
    const resolvedDateTime = eventDateTime ? new Date(eventDateTime) : new Date();
    const resolvedAddress = (eventAddress || "Demo Venue").trim();
    const ticketCount = parseQuantity(quantity);

    const accessCode = await generateAccessCode(async (candidate) => {
      const existing = await prisma.userEvent.findUnique({ where: { accessCode: candidate } });
      return !existing;
    });

    const event = await prisma.userEvent.create({
      data: {
        name: resolvedName,
        startsAt: resolvedDateTime,
        venue: resolvedAddress,
        accessCode,
        isDemo: true,
      },
    });

    const ticketPayloads = [];
    const localIds = new Set();

    for (let index = 0; index < ticketCount; index += 1) {
      let ticketPublicId = generateTicketPublicId();
      while (localIds.has(ticketPublicId)) {
        ticketPublicId = generateTicketPublicId();
      }
      localIds.add(ticketPublicId);
      ticketPayloads.push({
        eventId: event.id,
        ticketPublicId,
        status: "UNUSED",
      });
    }

    await prisma.ticket.createMany({ data: ticketPayloads });

    return res.status(201).json({
      eventId: event.id,
      accessCode,
      meta: {
        ticketType: ticketType || null,
        ticketPrice: ticketPrice || null,
        quantity: ticketCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create demo event." });
  }
}

module.exports = {
  createDemoEvent,
};
