const prisma = require("../utils/prisma");
const crypto = require("crypto");
const sharp = require("sharp");
const { getPublicBaseUrl } = require("../services/eventService");

const MAX_EVIDENCE_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE_OUTPUT_BYTES = 900 * 1024;
const MAX_EVIDENCE_DIMENSION = 1600;
const SUPPORTED_EVIDENCE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_CHAT_MESSAGE_LENGTH = 1200;

function normalizeTicketType(value) {
  return String(value || "").trim();
}

function normalizePrice(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTicketSelections(rawSelections) {
  if (!Array.isArray(rawSelections)) return [];
  const normalized = [];
  for (const item of rawSelections) {
    const ticketType = normalizeTicketType(item?.ticketType);
    const quantity = Math.max(0, Number.parseInt(String(item?.quantity || "0"), 10) || 0);
    if (!ticketType || quantity < 1) continue;
    normalized.push({ ticketType, quantity });
  }
  return normalized;
}

function decodeEvidenceDataUrl(dataUrl) {
  const value = String(dataUrl || "").trim();
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const base64 = match[2];
  const bytes = Buffer.byteLength(base64, "base64");
  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  return { mime, bytes, buffer };
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  if (isPng) return "image/png";

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (isJpeg) return "image/jpeg";

  const isWebp =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;
  if (isWebp) return "image/webp";

  return null;
}

async function sanitizeEvidenceDataUrl(dataUrl) {
  if (!dataUrl) return { ok: true, value: null };
  const decoded = decodeEvidenceDataUrl(dataUrl);
  if (!decoded) return { ok: false, error: "Evidence image must be a valid base64 image data URL." };
  if (!SUPPORTED_EVIDENCE_MIME.has(decoded.mime)) return { ok: false, error: "Evidence image must be PNG, JPEG, or WEBP." };
  if (decoded.bytes > MAX_EVIDENCE_INPUT_BYTES) return { ok: false, error: "Evidence image is too large. Maximum upload size is 8MB." };

  const detectedMime = detectImageMime(decoded.buffer);
  if (!detectedMime || detectedMime !== decoded.mime) {
    return { ok: false, error: "Evidence file content does not match the declared image type." };
  }

  try {
    const optimized = await sharp(decoded.buffer, { limitInputPixels: 4096 * 4096 })
      .rotate()
      .resize({
        width: MAX_EVIDENCE_DIMENSION,
        height: MAX_EVIDENCE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();

    if (optimized.length > MAX_EVIDENCE_OUTPUT_BYTES) {
      const smaller = await sharp(decoded.buffer, { limitInputPixels: 4096 * 4096 })
        .rotate()
        .resize({
          width: 1280,
          height: 1280,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 68, effort: 4 })
        .toBuffer();
      if (smaller.length > MAX_EVIDENCE_OUTPUT_BYTES) {
        return { ok: false, error: "Evidence image is too large after optimization. Please upload a smaller image." };
      }
      return { ok: true, value: `data:image/webp;base64,${smaller.toString("base64")}` };
    }

    return { ok: true, value: `data:image/webp;base64,${optimized.toString("base64")}` };
  } catch {
    return { ok: false, error: "Evidence image could not be processed safely." };
  }
}

function generateClientAccessToken() {
  return crypto.randomBytes(24).toString("hex");
}

function mapChatMessage(message) {
  return {
    id: message.id,
    senderType: message.senderType,
    message: message.message,
    createdAt: message.createdAt,
    readAt: message.readAt || null,
  };
}

async function createUniqueClientAccessToken() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = generateClientAccessToken();
    const existing = await prisma.ticketRequest.findFirst({
      where: { clientAccessToken: token },
      select: { id: true },
    });
    if (!existing) return token;
  }

  const error = new Error("Could not generate a unique client access token.");
  error.statusCode = 500;
  throw error;
}

async function buildTicketTypeStats(event) {
  const [availableByType, soldByType, pendingRequests] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["ticketType"],
      where: {
        eventId: event.id,
        ticketRequestId: null,
        status: "UNUSED",
        isInvalidated: false,
        deliveries: { none: { status: "SENT" } },
      },
      _count: { _all: true },
      _max: { ticketPrice: true },
    }),
    prisma.ticket.groupBy({
      by: ["ticketType"],
      where: { eventId: event.id, ticketRequestId: { not: null } },
      _count: { _all: true },
    }),
    prisma.ticketRequest.findMany({
      where: { eventId: event.id, status: "PENDING_PAYMENT" },
      select: { ticketType: true, quantity: true, ticketSelections: true },
    }),
  ]);

  const typeMap = new Map();
  const designGroups = Array.isArray(event.designJson?.ticketGroups) ? event.designJson.ticketGroups : [];
  for (const group of designGroups) {
    const ticketType = normalizeTicketType(group?.ticketType);
    if (!ticketType) continue;
    const price = normalizePrice(group?.ticketPrice);
    typeMap.set(ticketType, {
      ticketType,
      price,
      totalGenerated: 0,
      sold: 0,
      pending: 0,
      ticketsRemaining: 0,
    });
  }

  if (!typeMap.size && event.ticketType) {
    typeMap.set(event.ticketType, {
      ticketType: event.ticketType,
      price: event.ticketPrice != null ? Number(event.ticketPrice) : null,
      totalGenerated: 0,
      sold: 0,
      pending: 0,
      ticketsRemaining: 0,
    });
  }

  for (const row of availableByType) {
    const ticketType = normalizeTicketType(row.ticketType) || "General";
    const current = typeMap.get(ticketType) || {
      ticketType,
      price: null,
      totalGenerated: 0,
      sold: 0,
      pending: 0,
      ticketsRemaining: 0,
    };
    current.totalGenerated = Number(row._count?._all || 0);
    if (current.price == null && row._max?.ticketPrice != null) {
      current.price = Number(row._max.ticketPrice);
    }
    typeMap.set(ticketType, current);
  }

  const soldMap = new Map(
    soldByType.map((row) => [normalizeTicketType(row.ticketType) || "General", Number(row._count?._all || 0)]),
  );

  const pendingMap = new Map();
  for (const request of pendingRequests) {
    const requestSelections = parseTicketSelections(request.ticketSelections || []);
    if (requestSelections.length) {
      for (const selection of requestSelections) {
        pendingMap.set(selection.ticketType, (pendingMap.get(selection.ticketType) || 0) + selection.quantity);
      }
    } else {
      const fallbackType = normalizeTicketType(request.ticketType) || "General";
      pendingMap.set(fallbackType, (pendingMap.get(fallbackType) || 0) + Number(request.quantity || 0));
    }
  }

  const items = Array.from(typeMap.values()).map((item) => {
    const sold = soldMap.get(item.ticketType) || 0;
    const pending = pendingMap.get(item.ticketType) || 0;
    const ticketsRemaining = Math.max(0, Number(item.totalGenerated || 0) - pending);
    return {
      ticketType: item.ticketType,
      price: item.price,
      totalGenerated: Number(item.totalGenerated || 0),
      sold,
      pending,
      ticketsRemaining,
    };
  });

  return items.sort((a, b) => a.ticketType.localeCompare(b.ticketType));
}

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
      designJson: true,
      adminStatus: true,
      accessCode: true,
    },
  });

  if (!event || event.adminStatus !== "ACTIVE") {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const [ticketTypes, promoters] = await Promise.all([
    buildTicketTypeStats(event),
    prisma.promoter.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);
  const ticketsRemaining = ticketTypes.reduce((sum, item) => sum + Number(item.ticketsRemaining || 0), 0);

  res.json({
    event: {
      eventId: event.id,
      slug: event.slug,
      eventName: event.eventName,
      eventDate: event.eventDate,
      location: event.eventAddress,
      price: event.ticketPrice,
      paymentInstructions: event.paymentInstructions,
      ticketTypes,
      ticketsRemaining,
    },
    promoters,
  });
}

async function createPublicTicketRequest(req, res) {
  const eventSlug = String(req.body?.eventSlug || "").trim();
  const name = String(req.body?.name || "").trim();
  const promoterCode = String(req.body?.promoterCode || "").trim().toLowerCase();
  const ticketSelections = parseTicketSelections(req.body?.ticketSelections || []);
  const evidenceValidation = await sanitizeEvidenceDataUrl(req.body?.evidenceImageDataUrl);

  if (!eventSlug || !name) {
    res.status(400).json({ error: "eventSlug and name are required." });
    return;
  }
  if (!ticketSelections.length) {
    res.status(400).json({ error: "Select at least one ticket type with quantity." });
    return;
  }
  if (!evidenceValidation.ok) {
    res.status(400).json({ error: evidenceValidation.error });
    return;
  }
  if (!evidenceValidation.value) {
    res.status(400).json({ error: "Payment evidence is required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({
    where: { slug: eventSlug },
    select: {
      id: true,
      slug: true,
      eventName: true,
      paymentInstructions: true,
      ticketPrice: true,
      ticketType: true,
      designJson: true,
      adminStatus: true,
    },
  });

  if (!event || event.adminStatus !== "ACTIVE") {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const ticketTypes = await buildTicketTypeStats(event);
  const typeMap = new Map(ticketTypes.map((item) => [item.ticketType, item]));
  let totalQuantity = 0;
  let totalPrice = 0;
  const normalizedSelections = [];

  for (const selection of ticketSelections) {
    const selectedType = typeMap.get(selection.ticketType);
    if (!selectedType) {
      res.status(400).json({ error: `Selected ticket type is not available: ${selection.ticketType}` });
      return;
    }
    if (selection.quantity > selectedType.ticketsRemaining) {
      res.status(400).json({
        error: `Only ${selectedType.ticketsRemaining} tickets remaining for ${selection.ticketType}.`,
      });
      return;
    }
    const unitPrice = selectedType.price != null ? Number(selectedType.price) : 0;
    const lineTotal = unitPrice * selection.quantity;
    totalQuantity += selection.quantity;
    totalPrice += lineTotal;
    normalizedSelections.push({
      ticketType: selection.ticketType,
      quantity: selection.quantity,
      unitPrice,
      lineTotal,
    });
  }

  let promoter = null;
  if (promoterCode) {
    promoter = await prisma.promoter.findFirst({ where: { eventId: event.id, code: promoterCode } });
  }

  let clientAccessToken;
  try {
    clientAccessToken = await createUniqueClientAccessToken();
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Could not create request token." });
    return;
  }

  const request = await prisma.ticketRequest.create({
    data: {
      clientAccessToken,
      eventId: event.id,
      name,
      email: null,
      ticketType: normalizedSelections.length === 1 ? normalizedSelections[0].ticketType : "MIXED",
      ticketPrice: normalizedSelections.length === 1 ? normalizedSelections[0].unitPrice : null,
      totalPrice,
      ticketSelections: normalizedSelections,
      evidenceImageDataUrl: evidenceValidation.value,
      quantity: totalQuantity,
      promoterId: promoter?.id || null,
      status: "PENDING_PAYMENT",
    },
    select: {
      id: true,
      clientAccessToken: true,
      status: true,
      quantity: true,
      ticketType: true,
      ticketPrice: true,
      totalPrice: true,
      ticketSelections: true,
      evidenceImageDataUrl: true,
      promoter: { select: { name: true, code: true } },
      event: { select: { slug: true, paymentInstructions: true, eventName: true } },
    },
  });

  res.status(201).json({
    request,
    payment: {
      selections: normalizedSelections,
      totalQuantity,
      totalPrice,
    },
    instructions:
      totalPrice <= 0
        ? "Thanks for the request. The organizer will send your tickets in a few minutes."
        : request.event.paymentInstructions ||
          "Send payment using the organizer instructions and wait for approval.",
  });
}

async function getClientDashboardByToken(req, res) {
  const clientAccessToken = String(req.params.clientAccessToken || "").trim();
  if (!clientAccessToken) {
    res.status(400).json({ error: "clientAccessToken is required." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { clientAccessToken },
    select: {
      id: true,
      clientAccessToken: true,
      status: true,
      name: true,
      quantity: true,
      ticketType: true,
      totalPrice: true,
      ticketSelections: true,
      organizerMessage: true,
      createdAt: true,
      updatedAt: true,
      event: {
        select: {
          eventName: true,
          eventDate: true,
          eventAddress: true,
          slug: true,
        },
      },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          ticketPublicId: true,
          ticketType: true,
          status: true,
          isInvalidated: true,
          qrPayload: true,
        },
      },
    },
  });

  if (!request) {
    res.status(404).json({ error: "Client dashboard not found." });
    return;
  }

  const baseUrl = getPublicBaseUrl();
  const tickets = (request.tickets || []).map((ticket) => ({
    ticketPublicId: ticket.ticketPublicId,
    ticketType: ticket.ticketType || "General",
    status: ticket.status,
    isInvalidated: ticket.isInvalidated,
    ticketUrl: ticket.qrPayload || `${baseUrl}/t/${ticket.ticketPublicId}`,
  }));

  res.json({
    request: {
      id: request.id,
      clientAccessToken: request.clientAccessToken,
      status: request.status,
      name: request.name,
      quantity: request.quantity,
      ticketType: request.ticketType,
      ticketSelections: request.ticketSelections,
      organizerMessage: request.organizerMessage,
      totalPrice: request.totalPrice,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    },
    event: {
      eventName: request.event?.eventName || "",
      eventDate: request.event?.eventDate || null,
      eventAddress: request.event?.eventAddress || "",
      slug: request.event?.slug || null,
    },
    tickets,
  });
}

async function getClientRequestMessagesByToken(req, res) {
  const clientAccessToken = String(req.params.clientAccessToken || "").trim();
  if (!clientAccessToken) {
    res.status(400).json({ error: "clientAccessToken is required." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { clientAccessToken },
    select: { id: true },
  });
  if (!request) {
    res.status(404).json({ error: "Client dashboard not found." });
    return;
  }

  await prisma.ticketRequestMessage.updateMany({
    where: {
      ticketRequestId: request.id,
      senderType: "ORGANIZER",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  const messages = await prisma.ticketRequestMessage.findMany({
    where: { ticketRequestId: request.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderType: true, message: true, createdAt: true, readAt: true },
  });

  res.json({
    requestId: request.id,
    messages: messages.map(mapChatMessage),
  });
}

async function createClientRequestMessageByToken(req, res) {
  const clientAccessToken = String(req.params.clientAccessToken || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!clientAccessToken) {
    res.status(400).json({ error: "clientAccessToken is required." });
    return;
  }
  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Message is too long." });
    return;
  }

  const request = await prisma.ticketRequest.findFirst({
    where: { clientAccessToken },
    select: { id: true },
  });
  if (!request) {
    res.status(404).json({ error: "Client dashboard not found." });
    return;
  }

  const created = await prisma.ticketRequestMessage.create({
    data: {
      ticketRequestId: request.id,
      senderType: "CLIENT",
      message,
    },
    select: { id: true, senderType: true, message: true, createdAt: true, readAt: true },
  });

  res.status(201).json({ message: mapChatMessage(created) });
}

module.exports = {
  getPublicEventBySlug,
  createPublicTicketRequest,
  getClientDashboardByToken,
  getClientRequestMessagesByToken,
  createClientRequestMessageByToken,
};
