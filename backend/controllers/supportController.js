const crypto = require("crypto");
const sharp = require("sharp");
const prisma = require("../utils/prisma");

const MAX_CHAT_MESSAGE_LENGTH = 1200;
const MAX_EVIDENCE_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE_OUTPUT_BYTES = 900 * 1024;
const MAX_EVIDENCE_DIMENSION = 1600;
const SUPPORTED_EVIDENCE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function parseText(value, maxLen = 200) {
  return String(value || "").trim().slice(0, maxLen);
}

function parseMessage(value) {
  return String(value || "").trim();
}

function parseStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "OPEN" || normalized === "CLOSED") return normalized;
  return "";
}

function mapMessage(message) {
  return {
    id: message.id,
    senderType: message.senderType,
    message: message.message,
    evidenceImageDataUrl: message.evidenceImageDataUrl || null,
    createdAt: message.createdAt,
    readAt: message.readAt || null,
  };
}

function mapConversation(conversation) {
  return {
    id: conversation.id,
    conversationToken: conversation.conversationToken,
    displayName: conversation.displayName || "",
    email: conversation.email || "",
    accessCode: conversation.accessCode || "",
    status: conversation.status,
    event: conversation.event
      ? {
          id: conversation.event.id,
          eventName: conversation.event.eventName,
          organizerAccessCode: conversation.event.organizerAccessCode || conversation.event.accessCode,
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    unreadVisitorMessages: Number(conversation.unreadVisitorMessages || conversation._count?.messages || 0),
  };
}

async function getUnreadCountsByConversationIds(conversationIds) {
  if (!Array.isArray(conversationIds) || !conversationIds.length) return new Map();
  const grouped = await prisma.supportMessage.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: conversationIds },
      senderType: "VISITOR",
      readAt: null,
    },
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.conversationId, Number(row._count?._all || 0)]));
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
  if (!decoded) return { ok: false, error: "Image must be a valid base64 image data URL." };
  if (!SUPPORTED_EVIDENCE_MIME.has(decoded.mime)) return { ok: false, error: "Image must be PNG, JPEG, or WEBP." };
  if (decoded.bytes > MAX_EVIDENCE_INPUT_BYTES) return { ok: false, error: "Image is too large. Maximum upload size is 8MB." };

  const detectedMime = detectImageMime(decoded.buffer);
  if (!detectedMime || detectedMime !== decoded.mime) {
    return { ok: false, error: "Image content does not match the declared image type." };
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
        return { ok: false, error: "Image is too large after optimization. Please upload a smaller image." };
      }
      return { ok: true, value: `data:image/webp;base64,${smaller.toString("base64")}` };
    }

    return { ok: true, value: `data:image/webp;base64,${optimized.toString("base64")}` };
  } catch {
    return { ok: false, error: "Image could not be processed safely." };
  }
}

async function createConversationToken() {
  for (let index = 0; index < 8; index += 1) {
    const token = crypto.randomBytes(24).toString("hex");
    const existing = await prisma.supportConversation.findUnique({
      where: { conversationToken: token },
      select: { id: true },
    });
    if (!existing) return token;
  }
  const error = new Error("Could not create support conversation token.");
  error.statusCode = 500;
  throw error;
}

async function resolveEventByAccessCode(accessCodeRaw) {
  const accessCode = parseText(accessCodeRaw, 40);
  if (!accessCode) return null;

  const direct = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: { organizerAccessCode: true, accessCode: true },
  });
  const organizerAccessCode = direct?.organizerAccessCode || direct?.accessCode || accessCode;
  const event = await prisma.userEvent.findFirst({
    where: {
      OR: [{ organizerAccessCode }, { accessCode: organizerAccessCode }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return event;
}

async function createSupportConversation(req, res) {
  const displayName = parseText(req.body?.name, 120);
  const email = parseText(req.body?.email, 180).toLowerCase();
  const accessCode = parseText(req.body?.accessCode, 32).toUpperCase();
  const message = parseMessage(req.body?.message);
  const imageValidation = await sanitizeEvidenceDataUrl(req.body?.evidenceImageDataUrl);

  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    res.status(400).json({ error: "Message is too long." });
    return;
  }
  if (!displayName && !email && !accessCode) {
    res.status(400).json({ error: "Provide at least a name, email, or access code." });
    return;
  }
  if (!imageValidation.ok) {
    res.status(400).json({ error: imageValidation.error });
    return;
  }

  let event = null;
  if (accessCode) {
    event = await resolveEventByAccessCode(accessCode);
  }

  let conversationToken;
  try {
    conversationToken = await createConversationToken();
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Could not create support conversation." });
    return;
  }

  const conversation = await prisma.supportConversation.create({
    data: {
      conversationToken,
      displayName: displayName || null,
      email: email || null,
      accessCode: accessCode || null,
      eventId: event?.id || null,
      status: "OPEN",
      lastMessageAt: new Date(),
      messages: {
        create: {
          senderType: "VISITOR",
          message,
          evidenceImageDataUrl: imageValidation.value,
        },
      },
    },
    include: {
      event: { select: { id: true, eventName: true, organizerAccessCode: true, accessCode: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
      },
    },
  });

  res.status(201).json({
    conversation: mapConversation(conversation),
    messages: (conversation.messages || []).map(mapMessage),
  });
}

async function getSupportConversationMessages(req, res) {
  const conversationToken = parseText(req.params.conversationToken, 80);
  if (!conversationToken) {
    res.status(400).json({ error: "conversationToken is required." });
    return;
  }

  const conversation = await prisma.supportConversation.findUnique({
    where: { conversationToken },
    select: {
      id: true,
      conversationToken: true,
      displayName: true,
      email: true,
      accessCode: true,
      status: true,
      lastMessageAt: true,
      createdAt: true,
      updatedAt: true,
      event: { select: { id: true, eventName: true, organizerAccessCode: true, accessCode: true } },
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }

  await prisma.supportMessage.updateMany({
    where: {
      conversationId: conversation.id,
      senderType: "ADMIN",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  const messages = await prisma.supportMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
  });

  res.json({
    conversation: {
      ...conversation,
      event: conversation.event
        ? {
            id: conversation.event.id,
            eventName: conversation.event.eventName,
            organizerAccessCode: conversation.event.organizerAccessCode || conversation.event.accessCode,
          }
        : null,
    },
    messages: messages.map(mapMessage),
  });
}

async function sendSupportConversationMessage(req, res) {
  const conversationToken = parseText(req.params.conversationToken, 80);
  const message = parseMessage(req.body?.message);
  const imageValidation = await sanitizeEvidenceDataUrl(req.body?.evidenceImageDataUrl);
  if (!conversationToken) {
    res.status(400).json({ error: "conversationToken is required." });
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
  if (!imageValidation.ok) {
    res.status(400).json({ error: imageValidation.error });
    return;
  }

  const conversation = await prisma.supportConversation.findUnique({
    where: { conversationToken },
    select: { id: true, status: true },
  });
  if (!conversation) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }
  if (conversation.status === "CLOSED") {
    res.status(400).json({ error: "Conversation is closed." });
    return;
  }

  const created = await prisma.supportMessage.create({
    data: {
      conversationId: conversation.id,
      senderType: "VISITOR",
      message,
      evidenceImageDataUrl: imageValidation.value,
    },
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
  });

  await prisma.supportConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: created.createdAt, status: "OPEN" },
  });

  res.status(201).json({ message: mapMessage(created) });
}

async function listAdminSupportConversations(req, res) {
  const status = parseStatus(req.query?.status);
  const query = parseText(req.query?.q, 80).toLowerCase();

  const conversations = await prisma.supportConversation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { displayName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { accessCode: { contains: query, mode: "insensitive" } },
              { conversationToken: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }],
    take: 200,
    include: {
      event: { select: { id: true, eventName: true, organizerAccessCode: true, accessCode: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { message: true, createdAt: true, senderType: true },
      },
    },
  });
  const unreadMap = await getUnreadCountsByConversationIds(conversations.map((item) => item.id));

  res.json({
    items: conversations.map((conversation) => ({
      ...mapConversation({
        ...conversation,
        unreadVisitorMessages: unreadMap.get(conversation.id) || 0,
      }),
      latestMessage: conversation.messages?.[0] || null,
    })),
  });
}

async function getAdminSupportConversationMessages(req, res) {
  const conversationId = parseText(req.params.id, 64);
  if (!conversationId) {
    res.status(400).json({ error: "Conversation id is required." });
    return;
  }

  const conversationExists = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conversationExists) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }

  await prisma.supportMessage.updateMany({
    where: {
      conversationId,
      senderType: "VISITOR",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    include: {
      event: { select: { id: true, eventName: true, organizerAccessCode: true, accessCode: true } },
    },
  });
  if (!conversation) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }

  const messages = await prisma.supportMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
  });

  res.json({
    conversation: mapConversation({
      ...conversation,
      unreadVisitorMessages: 0,
    }),
    messages: messages.map(mapMessage),
  });
}

async function sendAdminSupportMessage(req, res) {
  const conversationId = parseText(req.params.id, 64);
  const message = parseMessage(req.body?.message);
  const imageValidation = await sanitizeEvidenceDataUrl(req.body?.evidenceImageDataUrl);

  if (!conversationId) {
    res.status(400).json({ error: "Conversation id is required." });
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
  if (!imageValidation.ok) {
    res.status(400).json({ error: imageValidation.error });
    return;
  }

  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conversation) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }

  const created = await prisma.supportMessage.create({
    data: {
      conversationId: conversation.id,
      senderType: "ADMIN",
      message,
      evidenceImageDataUrl: imageValidation.value,
    },
    select: { id: true, senderType: true, message: true, evidenceImageDataUrl: true, createdAt: true, readAt: true },
  });

  await prisma.supportConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: created.createdAt, status: "OPEN" },
  });

  res.status(201).json({ message: mapMessage(created) });
}

async function updateAdminSupportConversationStatus(req, res) {
  const conversationId = parseText(req.params.id, 64);
  const status = parseStatus(req.body?.status);
  if (!conversationId || !status) {
    res.status(400).json({ error: "Conversation id and valid status are required." });
    return;
  }

  const conversation = await prisma.supportConversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conversation) {
    res.status(404).json({ error: "Support conversation not found." });
    return;
  }

  const updated = await prisma.supportConversation.update({
    where: { id: conversation.id },
    data: { status },
    include: {
      event: { select: { id: true, eventName: true, organizerAccessCode: true, accessCode: true } },
    },
  });
  const unreadCount = await prisma.supportMessage.count({
    where: {
      conversationId: updated.id,
      senderType: "VISITOR",
      readAt: null,
    },
  });
  res.json({ conversation: mapConversation({ ...updated, unreadVisitorMessages: unreadCount }) });
}

module.exports = {
  createSupportConversation,
  getSupportConversationMessages,
  sendSupportConversationMessage,
  listAdminSupportConversations,
  getAdminSupportConversationMessages,
  sendAdminSupportMessage,
  updateAdminSupportConversationStatus,
};
