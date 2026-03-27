const prisma = require("../utils/prisma");
const crypto = require("crypto");
const sharp = require("sharp");
const { uploadDataUrlToS3, isS3Configured } = require("../utils/s3");
const { LIMITS, sanitizeText, safeError } = require("../utils/sanitize");
const { getPublicBaseUrl } = require("../services/eventService");
const {
  CHAT_CONVERSATION_TYPE,
  resolveActorFromClient,
  startConversationForActor,
  sendSystemMessageForTicketRequest,
} = require("../services/chatService");
const { sendTicketApprovedEmail, sendOrganizerNewRequestEmail, sendOrganizerNewMessageEmail, sendOtpEmail, sendClientRecoveryEmail, sendOrganizerRecoveryEmail } = require("../utils/mailer");
const { createTicketsForRequest } = require("./organizerController");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

async function upsertClientProfile(email) {
  return prisma.clientProfile.upsert({
    where: { email },
    create: {
      email,
      clientAccessToken: generateClientAccessToken(),
      tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
    update: {
      tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
}

function mapChatMessage(message) {
  return {
    id: message.id,
    senderType: message.senderType,
    message: message.message,
    evidenceImageDataUrl: message.evidenceImageDataUrl || null,
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
      where: {
        eventId: event.id,
        OR: [
          { ticketRequestId: { not: null } },
          { status: "USED" },
        ],
      },
      _count: { _all: true },
    }),
    prisma.ticketRequest.findMany({
      where: { eventId: event.id, status: "PENDING_VERIFICATION" },
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
      organizerName: true,
      eventName: true,
      eventDate: true,
      eventEndDate: true,
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

  const currency = String(event.designJson?.currency || "$").trim();
  res.json({
    event: {
      eventId: event.id,
      slug: event.slug,
      eventName: event.eventName,
      organizerName: event.organizerName,
      eventDate: event.eventDate,
      eventEndDate: event.eventEndDate,
      location: event.eventAddress,
      price: event.ticketPrice,
      currency,
      paymentInstructions: event.paymentInstructions,
      ticketTypes,
      ticketsRemaining,
    },
    promoters,
  });
}

async function createPublicTicketRequest(req, res) {
  const eventSlug = String(req.body?.eventSlug || "").trim();
  const name = sanitizeText(req.body?.name, LIMITS.NAME);
  const emailRaw = String(req.body?.email || "").trim().toLowerCase();
  const email = EMAIL_PATTERN.test(emailRaw) ? emailRaw : null;
  const otpToken = String(req.body?.otpToken || "").trim();
  const promoterCode = String(req.body?.promoterCode || "").trim().toLowerCase();
  const ticketSelections = parseTicketSelections(req.body?.ticketSelections || []);
  const evidenceValidation = await sanitizeEvidenceDataUrl(req.body?.evidenceImageDataUrl);

  if (!eventSlug || !name) {
    res.status(400).json({ error: "eventSlug and name are required." });
    return;
  }
  if (!email) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (!otpToken) {
    res.status(400).json({ error: "Email verification is required." });
    return;
  }

  // Validate OTP token
  const otpRecord = await prisma.emailVerification.findUnique({
    where: { token: otpToken },
  });
  if (!otpRecord || !otpRecord.verified || otpRecord.tokenUsed || otpRecord.email !== email || otpRecord.eventSlug !== eventSlug) {
    res.status(400).json({ error: "Invalid or expired verification token. Please verify your email again." });
    return;
  }
  // Mark token as used immediately to prevent replay
  await prisma.emailVerification.update({ where: { id: otpRecord.id }, data: { tokenUsed: true } });
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
      eventDate: true,
      eventAddress: true,
      paymentInstructions: true,
      ticketPrice: true,
      ticketType: true,
      designJson: true,
      adminStatus: true,
      autoApprove: true,
      organizerEmail: true,
      notifyOnRequest: true,
      organizerAccessCode: true,
      accessCode: true,
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

  if (totalPrice > 0 && !evidenceValidation.value) {
    res.status(400).json({ error: "Payment evidence is required." });
    return;
  }

  let promoter = null;
  if (promoterCode) {
    promoter = await prisma.promoter.findFirst({ where: { eventId: event.id, code: promoterCode } });
  }

  let clientProfile;
  try {
    clientProfile = await upsertClientProfile(email);
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not create request token.") });
    return;
  }

  // Upload evidence to S3 if configured, otherwise keep in DB
  let evidenceImageDataUrl = null;
  let evidenceS3Key = null;
  if (evidenceValidation.value) {
    if (isS3Configured()) {
      evidenceS3Key = await uploadDataUrlToS3(evidenceValidation.value, "evidence");
    } else {
      evidenceImageDataUrl = evidenceValidation.value;
    }
  }

  // Check for duplicate email on this event (warn organizer, don't block)
  const duplicateEmailWarning = await prisma.ticketRequest.findFirst({
    where: {
      eventId: event.id,
      email,
      status: { in: ["PENDING_VERIFICATION", "APPROVED"] },
    },
    select: { id: true },
  }).then(Boolean);

  const request = await prisma.ticketRequest.create({
    data: {
      clientProfileId: clientProfile.id,
      eventId: event.id,
      name,
      email,
      emailVerified: true,
      duplicateEmailWarning,
      ticketType: normalizedSelections.length === 1 ? normalizedSelections[0].ticketType : "MIXED",
      ticketPrice: normalizedSelections.length === 1 ? normalizedSelections[0].unitPrice : null,
      totalPrice,
      ticketSelections: normalizedSelections,
      evidenceImageDataUrl,
      evidenceS3Key,
      quantity: totalQuantity,
      promoterId: promoter?.id || null,
      // PENDING_VERIFICATION means the buyer is waiting for organizer approval.
      // (Email was already verified before this request was created via the OTP flow.)
      status: "PENDING_VERIFICATION",
    },
    select: {
      id: true,
      clientProfileId: true,
      clientProfile: { select: { clientAccessToken: true } },
      status: true,
      quantity: true,
      ticketType: true,
      ticketPrice: true,
      totalPrice: true,
      ticketSelections: true,
      evidenceImageDataUrl: true,
      email: true,
      promoter: { select: { name: true, code: true } },
      event: { select: { slug: true, paymentInstructions: true, eventName: true } },
    },
  });

  const clientActor = resolveActorFromClient(request.clientProfile.clientAccessToken);
  if (clientActor) {
    try {
      await startConversationForActor(clientActor, {
        conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT,
        ticketRequestId: request.id,
      });
    } catch {
      // Request creation should not fail if chat bootstrap fails.
    }
  }

  // Auto-approve: immediately assign tickets and notify buyer
  if (event.autoApprove) {
    try {
      const assignedTickets = await createTicketsForRequest({ event, request });
      await prisma.ticketRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED" },
      });

      sendSystemMessageForTicketRequest({
        ticketRequestId: request.id,
        body: `Your ticket request has been automatically approved. ${assignedTickets.length} ticket(s) are ready in your dashboard.`,
        emailFn: sendTicketApprovedEmail,
        emailArgs: {
          eventDate: event.eventDate,
          eventAddress: event.eventAddress,
        },
      }).catch(() => {});

      res.status(201).json({
        request: { ...request, status: "APPROVED" },
        payment: { selections: normalizedSelections, totalQuantity, totalPrice },
        autoApproved: true,
        instructions: "Your request was automatically approved! Check your client dashboard to view your ticket.",
      });
      return;
    } catch {
      // Auto-approve failed (e.g. no tickets left) — fall through to normal pending flow
    }
  }

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

  // Fire-and-forget organizer notification
  if (event.organizerEmail && event.notifyOnRequest) {
    const baseUrl = getPublicBaseUrl();
    const dashboardUrl = `${baseUrl}/dashboard?code=${encodeURIComponent(event.organizerAccessCode || event.accessCode)}`;
    sendOrganizerNewRequestEmail({
      to: event.organizerEmail,
      eventName: event.eventName,
      dashboardUrl,
    }).catch((err) => console.error("organizer notify email failed", err));
  }
}

async function getClientDashboardByToken(req, res) {
  const clientAccessToken = String(req.params.clientAccessToken || "").trim();
  if (!clientAccessToken) {
    res.status(400).json({ error: "clientAccessToken is required." });
    return;
  }

  const now = new Date();
  const profile = await prisma.clientProfile.findUnique({
    where: { clientAccessToken },
  });

  if (!profile || profile.tokenExpiresAt < now) {
    res.status(404).json({ error: "Client dashboard not found." });
    return;
  }

  // Sliding window — extend expiry on each access (fire and forget)
  prisma.clientProfile.update({
    where: { id: profile.id },
    data: { tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  }).catch(() => {});

  const requests = await prisma.ticketRequest.findMany({
    where: { clientProfileId: profile.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      name: true,
      quantity: true,
      ticketType: true,
      totalPrice: true,
      ticketSelections: true,
      organizerMessage: true,
      cancelledAt: true,
      cancellationReason: true,
      cancellationOtherReason: true,
      createdAt: true,
      updatedAt: true,
      event: {
        select: {
          id: true,
          eventName: true,
          eventDate: true,
          eventEndDate: true,
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
          cancelledAt: true,
          cancellationReason: true,
          cancellationOtherReason: true,
          scannedAt: true,
          qrPayload: true,
        },
      },
    },
  });

  const baseUrl = getPublicBaseUrl();
  const mappedRequests = requests.map((request) => ({
    id: request.id,
    status: request.status,
    name: request.name,
    quantity: request.quantity,
    ticketType: request.ticketType,
    ticketSelections: request.ticketSelections,
    organizerMessage: request.organizerMessage,
    cancelledAt: request.cancelledAt,
    cancellationReason: request.cancellationReason,
    cancellationOtherReason: request.cancellationOtherReason,
    totalPrice: request.totalPrice,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    event: {
      id: request.event?.id,
      eventName: request.event?.eventName || "",
      eventDate: request.event?.eventDate || null,
      eventEndDate: request.event?.eventEndDate || null,
      eventAddress: request.event?.eventAddress || "",
      slug: request.event?.slug || null,
    },
    tickets: (request.tickets || []).map((ticket) => ({
      ticketPublicId: ticket.ticketPublicId,
      ticketType: ticket.ticketType || "General",
      status: ticket.status,
      isInvalidated: ticket.isInvalidated,
      cancelledAt: ticket.cancelledAt,
      cancellationReason: ticket.cancellationReason,
      cancellationOtherReason: ticket.cancellationOtherReason,
      scannedAt: ticket.scannedAt,
      ticketUrl: ticket.qrPayload || `${baseUrl}/t/${ticket.ticketPublicId}`,
    })),
  }));

  res.json({ requests: mappedRequests });
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
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
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
    select: {
      id: true,
      name: true,
      event: {
        select: {
          eventName: true,
          organizerEmail: true,
          notifyOnMessage: true,
          organizerAccessCode: true,
          accessCode: true,
        },
      },
    },
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
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
  });

  res.status(201).json({ message: mapChatMessage(created) });

  // Fire-and-forget organizer notification
  const eventForNotif = request.event;
  if (eventForNotif?.organizerEmail && eventForNotif?.notifyOnMessage) {
    const baseUrl = getPublicBaseUrl();
    const dashboardUrl = `${baseUrl}/dashboard?code=${encodeURIComponent(eventForNotif.organizerAccessCode || eventForNotif.accessCode)}`;
    sendOrganizerNewMessageEmail({
      to: eventForNotif.organizerEmail,
      eventName: eventForNotif.eventName,
      senderName: request.name || "A customer",
      dashboardUrl,
    }).catch((err) => console.error("organizer message notify failed", err));
  }
}

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_VERIFIED_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours — skip re-verification if email recently verified

async function sendOtp(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const eventSlug = String(req.body?.eventSlug || "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (!eventSlug) {
    res.status(400).json({ error: "eventSlug is required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({
    where: { slug: eventSlug },
    select: { id: true, eventName: true, adminStatus: true },
  });
  if (!event || event.adminStatus !== "ACTIVE") {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  // If email was recently verified for this event, skip OTP and issue a new token directly
  const recentVerified = await prisma.emailVerification.findFirst({
    where: {
      email,
      eventSlug,
      verified: true,
      tokenUsed: true,
      createdAt: { gt: new Date(Date.now() - OTP_VERIFIED_CACHE_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentVerified) {
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.emailVerification.create({
      data: {
        email,
        eventSlug,
        code: "000000", // placeholder — not used
        verified: true,
        token,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });
    res.json({ sent: true, alreadyVerified: true, token });
    return;
  }

  // Invalidate any existing unused OTPs for this email+event
  await prisma.emailVerification.updateMany({
    where: { email, eventSlug, verified: false, tokenUsed: false },
    data: { expiresAt: new Date(0) },
  });

  const code = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, "0");
  await prisma.emailVerification.create({
    data: {
      email,
      eventSlug,
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    },
  });

  try {
    await sendOtpEmail({ to: email, code, eventName: event.eventName });
  } catch (err) {
    console.error("sendOtpEmail failed", err);
    res.status(500).json({ error: "Could not send verification email. Please try again." });
    return;
  }

  res.json({ sent: true });
}

async function verifyOtp(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const eventSlug = String(req.body?.eventSlug || "").trim();
  const code = String(req.body?.code || "").trim();

  if (!email || !eventSlug || !code) {
    res.status(400).json({ error: "email, eventSlug and code are required." });
    return;
  }

  const record = await prisma.emailVerification.findFirst({
    where: {
      email,
      eventSlug,
      verified: false,
      tokenUsed: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    res.status(400).json({ error: "Verification code expired or not found. Please request a new one." });
    return;
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    res.status(400).json({ error: "Too many incorrect attempts. Please request a new code." });
    return;
  }

  if (record.code !== code) {
    await prisma.emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = OTP_MAX_ATTEMPTS - record.attempts - 1;
    res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.emailVerification.update({
    where: { id: record.id },
    data: { verified: true, token },
  });

  res.json({ token });
}

const RECOVERY_SLUG = "__recovery__";
const ORGANIZER_RECOVERY_SLUG = "__organizer_recovery__";

async function sendRecoveryOtp(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  // Check if a client profile exists for this email — but don't reveal the answer
  const hasRequest = await prisma.clientProfile.findUnique({
    where: { email },
    select: { id: true },
  });

  if (hasRequest) {
    // Invalidate any existing unused recovery OTPs for this email
    await prisma.emailVerification.updateMany({
      where: { email, eventSlug: RECOVERY_SLUG, verified: false, tokenUsed: false },
      data: { expiresAt: new Date(0) },
    });

    const code = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, "0");
    await prisma.emailVerification.create({
      data: {
        email,
        eventSlug: RECOVERY_SLUG,
        code,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    sendOtpEmail({ to: email, code }).catch((err) => console.error("recovery OTP email failed", err));
  }

  // Always respond with success to avoid email enumeration
  res.json({ sent: true });
}

async function confirmRecoveryOtp(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();

  if (!email || !code) {
    res.status(400).json({ error: "email and code are required." });
    return;
  }

  const record = await prisma.emailVerification.findFirst({
    where: {
      email,
      eventSlug: RECOVERY_SLUG,
      verified: false,
      tokenUsed: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    res.status(400).json({ error: "Verification code expired or not found. Please request a new one." });
    return;
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    res.status(400).json({ error: "Too many incorrect attempts. Please request a new code." });
    return;
  }

  if (record.code !== code) {
    await prisma.emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = OTP_MAX_ATTEMPTS - record.attempts - 1;
    res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
    return;
  }

  // Mark OTP as used
  await prisma.emailVerification.update({
    where: { id: record.id },
    data: { verified: true, tokenUsed: true },
  });

  // Find the client profile and send their single dashboard link
  const clientProfile = await prisma.clientProfile.findUnique({
    where: { email },
    select: { clientAccessToken: true },
  });

  if (clientProfile) {
    const baseUrl = getPublicBaseUrl();
    const dashboardLinks = [{ eventName: "All your tickets", dashboardUrl: `${baseUrl}/client/${clientProfile.clientAccessToken}`, requestDate: "" }];
    sendClientRecoveryEmail({ to: email, dashboardLinks }).catch((err) =>
      console.error("client recovery email failed", err),
    );
  }

  // Always respond with success regardless of whether requests were found
  res.json({ sent: true });
}

async function sendOrganizerRecoveryOtp(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const hasEvents = await prisma.userEvent.findFirst({
    where: { organizerEmail: email },
    select: { id: true },
  });

  if (hasEvents) {
    await prisma.emailVerification.updateMany({
      where: { email, eventSlug: ORGANIZER_RECOVERY_SLUG, verified: false, tokenUsed: false },
      data: { expiresAt: new Date(0) },
    });

    const code = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, "0");
    await prisma.emailVerification.create({
      data: { email, eventSlug: ORGANIZER_RECOVERY_SLUG, code, expiresAt: new Date(Date.now() + OTP_EXPIRY_MS) },
    });

    sendOtpEmail({ to: email, code }).catch((err) => console.error("organizer recovery OTP email failed", err));
  }

  // Always respond with success to avoid email enumeration
  res.json({ sent: true });
}

async function confirmOrganizerRecoveryOtp(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  if (!email || !code) {
    res.status(400).json({ error: "email and code are required." });
    return;
  }

  const record = await prisma.emailVerification.findFirst({
    where: { email, eventSlug: ORGANIZER_RECOVERY_SLUG, verified: false, tokenUsed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    res.status(400).json({ error: "Verification code expired or not found. Please request a new one." });
    return;
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    res.status(400).json({ error: "Too many incorrect attempts. Please request a new code." });
    return;
  }

  if (record.code !== code) {
    await prisma.emailVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    const remaining = OTP_MAX_ATTEMPTS - record.attempts - 1;
    res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
    return;
  }

  await prisma.emailVerification.update({ where: { id: record.id }, data: { verified: true, tokenUsed: true } });

  // Find all events for this organizer email and group by organizerAccessCode
  const events = await prisma.userEvent.findMany({
    where: { organizerEmail: email },
    select: { organizerAccessCode: true, eventName: true },
    orderBy: { createdAt: "asc" },
  });

  if (events.length > 0) {
    // Group event names by organizerAccessCode (one organizer may have multiple events)
    const codeMap = new Map();
    for (const ev of events) {
      const key = ev.organizerAccessCode;
      if (!codeMap.has(key)) codeMap.set(key, []);
      codeMap.get(key).push(ev.eventName || "Unnamed event");
    }
    const entries = Array.from(codeMap.entries()).map(([organizerAccessCode, eventNames]) => ({ organizerAccessCode, eventNames }));
    sendOrganizerRecoveryEmail({ to: email, entries }).catch((err) => console.error("organizer recovery email failed", err));
  }

  // Always respond with success to avoid enumeration
  res.json({ sent: true });
}

module.exports = {
  getPublicEventBySlug,
  sendOtp,
  verifyOtp,
  createPublicTicketRequest,
  getClientDashboardByToken,
  getClientRequestMessagesByToken,
  createClientRequestMessageByToken,
  sendRecoveryOtp,
  confirmRecoveryOtp,
  sendOrganizerRecoveryOtp,
  confirmOrganizerRecoveryOtp,
};

