const prisma = require("../utils/prisma");
const { generateAccessCode, generateOrganizerAccessCode } = require("../utils/accessCode");
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

async function generateEventSlug(eventName) {
  const base = slugify(eventName) || "event";
  let slug = base;
  let index = 2;
  while (true) {
    const exists = await prisma.userEvent.findUnique({ where: { slug } });
    if (!exists) return slug;
    slug = `${base}-${index}`;
    index += 1;
  }
}

async function createEvent(payload, isDemo = false) {
  const requestedQuantity = Number.parseInt(payload.quantity, 10);
  const quantity = payload.generateAccessOnly ? 0 : Math.max(1, Number.isFinite(requestedQuantity) ? requestedQuantity : 1);
  const accessCode = await generateAccessCode(async (code) => {
    const existing = await prisma.userEvent.findUnique({ where: { accessCode: code } });
    return !existing;
  });
  const organizerAccessCode = await generateOrganizerAccessCode(async (code) => {
    const existing = await prisma.userEvent.findFirst({
      where: {
        OR: [
          { organizerAccessCode: code },
          { accessCode: code },
        ],
      },
      select: { id: true },
    });
    return !existing;
  });

  const slug = await generateEventSlug(payload.eventSlug || payload.eventName || "event");
  const event = await prisma.userEvent.create({
    data: {
      organizerName: String(payload.organizerName || "").trim() || null,
      eventName: payload.eventName || "QR Tickets Demo Event",
      eventDate: resolveEventDate(payload),
      eventAddress: payload.eventAddress || "Demo Venue",
      slug,
      ticketType: payload.ticketType || null,
      ticketPrice: payload.ticketPrice ? Number(payload.ticketPrice) : null,
      paymentInstructions: String(payload.paymentInstructions || "").trim() || null,
      designJson:
        payload.designJson && typeof payload.designJson === "object" ? payload.designJson : null,
      quantity,
      accessCode,
      organizerAccessCode,
      isDemo,
    },
  });

  const ids = new Set();
  const tickets = [];
  const ticketType = String(payload.ticketType || "").trim() || null;
  const ticketPriceRaw = String(payload.ticketPrice ?? "").trim();
  const parsedTicketPrice = ticketPriceRaw === "" ? null : Number(ticketPriceRaw);
  const ticketPrice = Number.isFinite(parsedTicketPrice) ? parsedTicketPrice : null;
  const designJson = payload.designJson && typeof payload.designJson === "object" ? payload.designJson : null;
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
      ticketType,
      ticketPrice,
      designJson,
    });
  }

  if (tickets.length) {
    await prisma.ticket.createMany({ data: tickets });
  }
  return { eventId: event.id, accessCode, organizerAccessCode };
}

module.exports = { createEvent, getPublicBaseUrl, buildQrPayload };
