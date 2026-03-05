const prisma = require("../utils/prisma");
const { generateAccessCode } = require("../utils/accessCode");
const { generateTicketPublicId } = require("../utils/ticketPublicId");

async function createEvent(payload, isDemo = false) {
  const quantity = Math.max(1, Number.parseInt(payload.quantity, 10) || 1);
  const accessCode = await generateAccessCode(async (code) => {
    const existing = await prisma.userEvent.findUnique({ where: { accessCode: code } });
    return !existing;
  });

  const event = await prisma.userEvent.create({
    data: {
      eventName: payload.eventName || "QR Tickets Demo Event",
      eventDate: payload.eventDateTime ? new Date(payload.eventDateTime) : new Date(),
      eventAddress: payload.eventAddress || "Demo Venue",
      ticketType: payload.ticketType || null,
      ticketPrice: payload.ticketPrice ? Number(payload.ticketPrice) : null,
      quantity,
      accessCode,
      isDemo,
    },
  });

  const ids = new Set();
  const tickets = [];
  for (let index = 0; index < quantity; index += 1) {
    let ticketPublicId = generateTicketPublicId();
    while (ids.has(ticketPublicId)) {
      ticketPublicId = generateTicketPublicId();
    }
    ids.add(ticketPublicId);
    tickets.push({
      eventId: event.id,
      ticketPublicId,
      qrPayload: ticketPublicId,
      status: "UNUSED",
    });
  }

  await prisma.ticket.createMany({ data: tickets });
  return { eventId: event.id, accessCode };
}

module.exports = { createEvent };
