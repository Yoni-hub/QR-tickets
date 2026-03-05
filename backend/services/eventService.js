const prisma = require("../utils/prisma");
const { generateAccessCode } = require("../utils/accessCode");
const { generateTicketPublicId } = require("../utils/ticketPublicId");

function getPublicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || "http://localhost:5174").replace(/\/$/, "");
}

function buildQrPayload(ticketPublicId) {
  return `${getPublicBaseUrl()}/t/${ticketPublicId}`;
}

function resolveEventDate(payload) {
  const rawEventDateTime = String(payload.eventDateTime || "").trim();
  const rawDateTimeText = String(payload.dateTimeText || "").trim();

  if (rawEventDateTime) {
    const parsed = new Date(rawEventDateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (rawDateTimeText) {
    const normalized = rawDateTimeText.replace(/\s*\|\s*/g, " ");
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return new Date();
}

async function createEvent(payload, isDemo = false) {
  const quantity = Math.max(1, Number.parseInt(payload.quantity, 10) || 1);
  const accessCode = await generateAccessCode(async (code) => {
    const existing = await prisma.userEvent.findUnique({ where: { accessCode: code } });
    return !existing;
  });

  const event = await prisma.userEvent.create({
    data: {
      eventName: payload.eventName || "QR Tickets Demo Event",
      eventDate: resolveEventDate(payload),
      eventAddress: payload.eventAddress || "Demo Venue",
      ticketType: payload.ticketType || null,
      ticketPrice: payload.ticketPrice ? Number(payload.ticketPrice) : null,
      designJson:
        payload.designJson && typeof payload.designJson === "object" ? payload.designJson : null,
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
      qrPayload: buildQrPayload(ticketPublicId),
      status: "UNUSED",
    });
  }

  await prisma.ticket.createMany({ data: tickets });
  return { eventId: event.id, accessCode };
}

module.exports = { createEvent, getPublicBaseUrl, buildQrPayload };
