const prisma = require("../utils/prisma");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;
const SUPPORTED_EVIDENCE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  const bytes = Buffer.byteLength(match[2], "base64");
  return { mime, bytes };
}

function validateEvidenceDataUrl(dataUrl) {
  if (!dataUrl) return { ok: true, value: null };
  const decoded = decodeEvidenceDataUrl(dataUrl);
  if (!decoded) return { ok: false, error: "Evidence image must be a valid base64 image data URL." };
  if (!SUPPORTED_EVIDENCE_MIME.has(decoded.mime)) return { ok: false, error: "Evidence image must be PNG, JPEG, or WEBP." };
  if (decoded.bytes > MAX_EVIDENCE_BYTES) return { ok: false, error: "Evidence image is too large. Maximum size is 2MB." };
  return { ok: true, value: String(dataUrl) };
}

async function buildTicketTypeStats(event) {
  const [ticketsByType, usedByType, pendingRequests] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["ticketType"],
      where: { eventId: event.id },
      _count: { _all: true },
      _max: { ticketPrice: true },
    }),
    prisma.ticket.groupBy({
      by: ["ticketType"],
      where: { eventId: event.id, status: "USED" },
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
      used: 0,
      pending: 0,
      ticketsRemaining: 0,
    });
  }

  if (!typeMap.size && event.ticketType) {
    typeMap.set(event.ticketType, {
      ticketType: event.ticketType,
      price: event.ticketPrice != null ? Number(event.ticketPrice) : null,
      totalGenerated: 0,
      used: 0,
      pending: 0,
      ticketsRemaining: 0,
    });
  }

  for (const row of ticketsByType) {
    const ticketType = normalizeTicketType(row.ticketType) || "General";
    const current = typeMap.get(ticketType) || {
      ticketType,
      price: null,
      totalGenerated: 0,
      used: 0,
      pending: 0,
      ticketsRemaining: 0,
    };
    current.totalGenerated = Number(row._count?._all || 0);
    if (current.price == null && row._max?.ticketPrice != null) {
      current.price = Number(row._max.ticketPrice);
    }
    typeMap.set(ticketType, current);
  }

  const usedMap = new Map(
    usedByType.map((row) => [normalizeTicketType(row.ticketType) || "General", Number(row._count?._all || 0)]),
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
    const used = usedMap.get(item.ticketType) || 0;
    const pending = pendingMap.get(item.ticketType) || 0;
    const ticketsRemaining = Math.max(0, Number(item.totalGenerated || 0) - used - pending);
    return {
      ticketType: item.ticketType,
      price: item.price,
      totalGenerated: Number(item.totalGenerated || 0),
      used,
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
  const email = String(req.body?.email || "").trim().toLowerCase();
  const promoterCode = String(req.body?.promoterCode || "").trim().toLowerCase();
  const ticketSelections = parseTicketSelections(req.body?.ticketSelections || []);
  const evidenceValidation = validateEvidenceDataUrl(req.body?.evidenceImageDataUrl);

  if (!eventSlug || !name || !email) {
    res.status(400).json({ error: "eventSlug, name, and email are required." });
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "A valid email is required." });
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

  const request = await prisma.ticketRequest.create({
    data: {
      eventId: event.id,
      name,
      email,
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
      request.event.paymentInstructions ||
      "Send payment using the organizer instructions and wait for approval.",
  });
}

module.exports = {
  getPublicEventBySlug,
  createPublicTicketRequest,
};
