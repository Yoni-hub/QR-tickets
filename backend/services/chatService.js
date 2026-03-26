const crypto = require("crypto");
const fs = require("fs");
const prisma = require("../utils/prisma");
const { saveChatAttachment, resolveAttachmentAbsolutePath } = require("./chatAttachmentService");
const socketManager = require("../socket/socketManager");
const { sendNewChatMessageEmail, sendOrganizerNewMessageEmail } = require("../utils/mailer");
const { getPublicBaseUrl } = require("./eventService");

const CHAT_ACTOR = {
  ADMIN: "ADMIN",
  ORGANIZER: "ORGANIZER",
  CLIENT: "CLIENT",
};

const CHAT_CONVERSATION_TYPE = {
  ORGANIZER_ADMIN: "ORGANIZER_ADMIN",
  ORGANIZER_CLIENT: "ORGANIZER_CLIENT",
  ADMIN_CLIENT: "ADMIN_CLIENT",
};

const CHAT_CONVERSATION_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
};

const CHAT_MESSAGE_TYPE = {
  TEXT: "TEXT",
  TEXT_WITH_ATTACHMENT: "TEXT_WITH_ATTACHMENT",
  ATTACHMENT_ONLY: "ATTACHMENT_ONLY",
  SYSTEM: "SYSTEM",
};

const CHAT_MESSAGE_EMAIL_STATUS = {
  SENT: "SENT",
  FAILED: "FAILED",
  NO_EMAIL: "NO_EMAIL",
};

function normalizeText(value, maxLength = 1200) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeAccessCode(value) {
  return String(value || "").trim();
}

function normalizeClientAccessToken(value) {
  return String(value || "").trim();
}

function createClientSupportToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function resolveOrganizerScope(accessCodeRaw) {
  const accessCode = normalizeAccessCode(accessCodeRaw);
  if (!accessCode) return null;

  const direct = await prisma.userEvent.findFirst({
    where: {
      OR: [{ accessCode }, { organizerAccessCode: accessCode }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, accessCode: true, organizerAccessCode: true },
  });
  if (!direct) return null;

  const organizerAccessCode = direct.organizerAccessCode || direct.accessCode;
  const defaultEvent = await prisma.userEvent.findFirst({
    where: {
      OR: [{ organizerAccessCode }, { accessCode: organizerAccessCode }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return {
    organizerAccessCode,
    defaultEventId: defaultEvent?.id || direct.id,
  };
}

async function resolveTicketRequestContext(ticketRequestIdRaw) {
  const ticketRequestId = String(ticketRequestIdRaw || "").trim();
  if (!ticketRequestId) return null;
  const request = await prisma.ticketRequest.findUnique({
    where: { id: ticketRequestId },
    select: {
      id: true,
      eventId: true,
      clientProfile: { select: { clientAccessToken: true } },
      event: {
        select: {
          accessCode: true,
          organizerAccessCode: true,
        },
      },
    },
  });
  if (!request) return null;
  return {
    ticketRequestId: request.id,
    eventId: request.eventId,
    clientAccessToken: normalizeClientAccessToken(request.clientProfile?.clientAccessToken || "") || `legacy-request-${request.id}`,
    organizerAccessCode: request.event?.organizerAccessCode || request.event?.accessCode || "",
  };
}

function resolveActorFromOrganizer(accessCodeRaw) {
  return resolveOrganizerScope(accessCodeRaw).then((scope) => {
    if (!scope) return null;
    return {
      type: CHAT_ACTOR.ORGANIZER,
      organizerAccessCode: scope.organizerAccessCode,
      eventId: scope.defaultEventId,
    };
  });
}

function resolveActorFromClient(clientAccessTokenRaw) {
  const token = normalizeClientAccessToken(clientAccessTokenRaw);
  if (!token) return null;
  return {
    type: CHAT_ACTOR.CLIENT,
    clientAccessToken: token,
  };
}

function resolvePartyForActor(conversation, actor) {
  if (!conversation || !actor) return "";

  const matchParty = (partyPrefix) => {
    const type = conversation[`${partyPrefix}Type`];
    if (type !== actor.type) return false;
    if (type === CHAT_ACTOR.ADMIN) return true;
    if (type === CHAT_ACTOR.ORGANIZER) {
      return String(conversation[`${partyPrefix}OrganizerAccessCode`] || "") === String(actor.organizerAccessCode || "");
    }
    if (type === CHAT_ACTOR.CLIENT) {
      return String(conversation[`${partyPrefix}ClientAccessToken`] || "") === String(actor.clientAccessToken || "");
    }
    return false;
  };

  if (matchParty("partyA")) return "A";
  if (matchParty("partyB")) return "B";
  return "";
}

function buildConversationActorWhere(actor) {
  if (!actor) return null;
  if (actor.type === CHAT_ACTOR.ADMIN) {
    return {
      OR: [{ partyAType: CHAT_ACTOR.ADMIN }, { partyBType: CHAT_ACTOR.ADMIN }],
    };
  }
  if (actor.type === CHAT_ACTOR.ORGANIZER) {
    return {
      OR: [
        { partyAType: CHAT_ACTOR.ORGANIZER, partyAOrganizerAccessCode: actor.organizerAccessCode },
        { partyBType: CHAT_ACTOR.ORGANIZER, partyBOrganizerAccessCode: actor.organizerAccessCode },
      ],
    };
  }
  return {
    OR: [
      { partyAType: CHAT_ACTOR.CLIENT, partyAClientAccessToken: actor.clientAccessToken },
      { partyBType: CHAT_ACTOR.CLIENT, partyBClientAccessToken: actor.clientAccessToken },
    ],
  };
}

function buildAttachmentView(attachment, options = {}) {
  const actorType = options.actorType || "";
  const accessCode = options.accessCode || "";
  const clientAccessToken = options.clientAccessToken || "";

  if (!attachment) return null;

  let downloadUrl = "";
  if (attachment.storageType === "LOCAL_FILE") {
    if (actorType === CHAT_ACTOR.ADMIN) {
      downloadUrl = `/api/admin/chat/attachments/${encodeURIComponent(attachment.id)}`;
    } else if (actorType === CHAT_ACTOR.ORGANIZER) {
      downloadUrl = `/api/events/by-code/${encodeURIComponent(accessCode)}/chat/attachments/${encodeURIComponent(attachment.id)}`;
    } else if (actorType === CHAT_ACTOR.CLIENT) {
      downloadUrl = `/api/public/client-dashboard/${encodeURIComponent(clientAccessToken)}/chat/attachments/${encodeURIComponent(attachment.id)}`;
    }
  }

  return {
    id: attachment.id,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    originalName: attachment.originalName,
    sizeBytes: attachment.sizeBytes,
    storageType: attachment.storageType,
    downloadUrl,
    legacyDataUrl: attachment.storageType === "LEGACY_DATA_URL" ? attachment.legacyDataUrl : null,
  };
}

function mapMessage(message, options = {}) {
  const attachment = Array.isArray(message.attachments) ? message.attachments[0] : null;
  const attachmentView = buildAttachmentView(attachment, options);

  return {
    id: message.id,
    senderType: message.senderType,
    message: message.body,
    messageType: message.messageType,
    emailStatus: message.emailStatus || null,
    createdAt: message.createdAt,
    attachment: attachmentView,
    evidenceImageDataUrl:
      attachmentView && attachmentView.kind === "IMAGE"
        ? attachmentView.legacyDataUrl || attachmentView.downloadUrl
        : null,
  };
}

function mapConversation(conversation, options = {}) {
  const party = resolvePartyForActor(conversation, options.actor || null);
  const counterpartPrefix = party === "A" ? "partyB" : "partyA";
  const counterpartType = conversation[`${counterpartPrefix}Type`] || "";
  const unreadCount = Number(options.unreadCount || 0);

  return {
    id: conversation.id,
    conversationType: conversation.conversationType,
    status: conversation.status,
    subject: conversation.subject || "",
    eventId: conversation.eventId || null,
    ticketRequestId: conversation.ticketRequestId || null,
    legacySupportConversationToken: (options.actor?.type === CHAT_ACTOR.ADMIN || options.actor?.type === CHAT_ACTOR.CLIENT)
      ? (conversation.legacySupportConversationToken || null)
      : null,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    counterpart: {
      type: counterpartType,
    },
    event: conversation.event
      ? {
          id: conversation.event.id,
          eventName: conversation.event.eventName,
          organizerName: conversation.event.organizerName || null,
        }
      : null,
    ticketRequest: conversation.ticketRequest
      ? {
          id: conversation.ticketRequest.id,
          status: conversation.ticketRequest.status,
          name: conversation.ticketRequest.name,
        }
      : null,
    unreadCount,
    latestMessage: conversation.messages?.[0]
      ? mapMessage(conversation.messages[0], {
          actorType: options.actor?.type,
          accessCode: options.actor?.organizerAccessCode,
          clientAccessToken: options.actor?.clientAccessToken,
        })
      : null,
  };
}

async function countUnreadForConversation(conversation, party) {
  if (!party) return 0;
  const readAt = party === "A" ? conversation.partyAReadAt : conversation.partyBReadAt;
  const senderType = party === "A" ? conversation.partyAType : conversation.partyBType;

  const where = {
    conversationId: conversation.id,
    senderType: {
      not: senderType,
    },
    ...(readAt ? { createdAt: { gt: readAt } } : {}),
  };

  return prisma.chatMessage.count({ where });
}

async function findConversationForActor(conversationIdRaw, actor) {
  const conversationId = String(conversationIdRaw || "").trim();
  if (!conversationId) return null;

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      event: { select: { id: true, eventName: true, organizerName: true } },
      ticketRequest: { select: { id: true, status: true, name: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { attachments: true },
      },
    },
  });
  if (!conversation) return null;

  const party = resolvePartyForActor(conversation, actor);
  if (!party) return null;

  return { conversation, party };
}

async function ensureOrganizerClientConversationByRequestId(ticketRequestIdRaw) {
  const context = await resolveTicketRequestContext(ticketRequestIdRaw);
  if (!context) {
    const error = new Error("Ticket request not found.");
    error.statusCode = 404;
    throw error;
  }

  const existing = await prisma.chatConversation.findFirst({
    where: {
      ticketRequestId: context.ticketRequestId,
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.chatConversation.create({
    data: {
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT,
      status: CHAT_CONVERSATION_STATUS.OPEN,
      subject: "Ticket request chat",
      eventId: context.eventId,
      ticketRequestId: context.ticketRequestId,
      partyAType: CHAT_ACTOR.ORGANIZER,
      partyAOrganizerAccessCode: context.organizerAccessCode,
      partyBType: CHAT_ACTOR.CLIENT,
      partyBClientAccessToken: context.clientAccessToken,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });

  return created.id;
}

async function ensureOrganizerAdminConversation({ organizerAccessCode, eventId, subject }) {
  const existing = await prisma.chatConversation.findFirst({
    where: {
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_ADMIN,
      status: CHAT_CONVERSATION_STATUS.OPEN,
      OR: [
        { partyAType: CHAT_ACTOR.ORGANIZER, partyAOrganizerAccessCode: organizerAccessCode },
        { partyBType: CHAT_ACTOR.ORGANIZER, partyBOrganizerAccessCode: organizerAccessCode },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.chatConversation.create({
    data: {
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_ADMIN,
      status: CHAT_CONVERSATION_STATUS.OPEN,
      subject: normalizeText(subject || "Organizer support", 180),
      eventId: eventId || null,
      partyAType: CHAT_ACTOR.ORGANIZER,
      partyAOrganizerAccessCode: organizerAccessCode,
      partyBType: CHAT_ACTOR.ADMIN,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureAdminClientConversation({ clientAccessToken, subject, eventId, legacySupportConversationToken, ticketRequestId }) {
  const normalizedEventId = eventId ? String(eventId).trim() : null;
  const existing = await prisma.chatConversation.findFirst({
    where: {
      conversationType: CHAT_CONVERSATION_TYPE.ADMIN_CLIENT,
      status: CHAT_CONVERSATION_STATUS.OPEN,
      ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
      OR: [
        { partyAType: CHAT_ACTOR.CLIENT, partyAClientAccessToken: clientAccessToken },
        { partyBType: CHAT_ACTOR.CLIENT, partyBClientAccessToken: clientAccessToken },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, ticketRequestId: true },
  });
  if (existing) {
    if (ticketRequestId && !existing.ticketRequestId) {
      await prisma.chatConversation.update({ where: { id: existing.id }, data: { ticketRequestId } });
    }
    return existing.id;
  }

  const created = await prisma.chatConversation.create({
    data: {
      conversationType: CHAT_CONVERSATION_TYPE.ADMIN_CLIENT,
      status: CHAT_CONVERSATION_STATUS.OPEN,
      subject: normalizeText(subject || "Client support", 180),
      eventId: eventId || null,
      ticketRequestId: ticketRequestId || null,
      legacySupportConversationToken: legacySupportConversationToken || null,
      partyAType: CHAT_ACTOR.ADMIN,
      partyBType: CHAT_ACTOR.CLIENT,
      partyBClientAccessToken: clientAccessToken,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });
  return created.id;
}

async function startConversationForActor(actor, payload = {}) {
  const conversationType = String(payload.conversationType || "").trim().toUpperCase();
  if (!conversationType) {
    const error = new Error("conversationType is required.");
    error.statusCode = 400;
    throw error;
  }

  if (actor.type === CHAT_ACTOR.ORGANIZER && conversationType === CHAT_CONVERSATION_TYPE.ADMIN_CLIENT) {
    const error = new Error("Organizer cannot create admin/client conversations.");
    error.statusCode = 403;
    throw error;
  }
  if (actor.type === CHAT_ACTOR.CLIENT && conversationType === CHAT_CONVERSATION_TYPE.ORGANIZER_ADMIN) {
    const error = new Error("Client cannot create organizer/admin conversations.");
    error.statusCode = 403;
    throw error;
  }
  if (actor.type === CHAT_ACTOR.ADMIN && conversationType === CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT) {
    const error = new Error("Admin cannot create organizer/client conversations.");
    error.statusCode = 403;
    throw error;
  }

  if (conversationType === CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT) {
    const conversationId = await ensureOrganizerClientConversationByRequestId(payload.ticketRequestId);
    const resolved = await findConversationForActor(conversationId, actor.type === CHAT_ACTOR.ADMIN ? { type: CHAT_ACTOR.ADMIN } : actor);
    if (!resolved && actor.type !== CHAT_ACTOR.ADMIN) {
      const error = new Error("Conversation not available for actor.");
      error.statusCode = 403;
      throw error;
    }
    return conversationId;
  }

  if (conversationType === CHAT_CONVERSATION_TYPE.ORGANIZER_ADMIN) {
    let organizerAccessCode = normalizeAccessCode(payload.organizerAccessCode);
    let eventId = String(payload.eventId || "").trim();

    if (actor.type === CHAT_ACTOR.ORGANIZER) {
      organizerAccessCode = actor.organizerAccessCode;
      eventId = payload.eventId || actor.eventId || "";
    }

    if (!organizerAccessCode) {
      const error = new Error("organizerAccessCode is required.");
      error.statusCode = 400;
      throw error;
    }

    return ensureOrganizerAdminConversation({ organizerAccessCode, eventId, subject: payload.subject });
  }

  if (conversationType === CHAT_CONVERSATION_TYPE.ADMIN_CLIENT) {
    let clientAccessToken = normalizeClientAccessToken(payload.clientAccessToken);
    if (actor.type === CHAT_ACTOR.CLIENT) clientAccessToken = actor.clientAccessToken;
    if (!clientAccessToken) {
      clientAccessToken = createClientSupportToken();
    }
    return ensureAdminClientConversation({
      clientAccessToken,
      eventId: payload.eventId,
      subject: payload.subject,
      legacySupportConversationToken: payload.legacySupportConversationToken,
      ticketRequestId: payload.ticketRequestId || null,
    });
  }

  const error = new Error("Unsupported conversationType.");
  error.statusCode = 400;
  throw error;
}

async function listConversationsForActor(actor, options = {}) {
  const actorWhere = buildConversationActorWhere(actor);
  if (!actorWhere) {
    const error = new Error("Actor is required.");
    error.statusCode = 400;
    throw error;
  }

  const status = String(options.status || "").trim().toUpperCase();
  const conversationType = String(options.conversationType || "").trim().toUpperCase();
  const query = normalizeText(options.q, 100).toLowerCase();

  const items = await prisma.chatConversation.findMany({
    where: {
      ...actorWhere,
      ...(status === CHAT_CONVERSATION_STATUS.OPEN || status === CHAT_CONVERSATION_STATUS.CLOSED ? { status } : {}),
      ...(Object.values(CHAT_CONVERSATION_TYPE).includes(conversationType) ? { conversationType } : {}),
      ...(options.eventId ? { eventId: String(options.eventId).trim() } : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }],
    take: 200,
    include: {
      event: { select: { id: true, eventName: true, organizerName: true } },
      ticketRequest: { select: { id: true, status: true, name: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { attachments: true },
      },
    },
  });

  const filtered = query
    ? items.filter((item) => {
        const haystack = [
          item.subject,
          item.event?.eventName,
          item.event?.organizerName,
          item.ticketRequest?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : items;

  const unreadCounts = await Promise.all(
    filtered.map(async (conversation) => {
      const party = resolvePartyForActor(conversation, actor);
      const unreadCount = await countUnreadForConversation(conversation, party);
      return [conversation.id, unreadCount];
    }),
  );
  const unreadMap = new Map(unreadCounts);

  return filtered.map((conversation) =>
    mapConversation(conversation, {
      actor,
      unreadCount: unreadMap.get(conversation.id) || 0,
    }),
  );
}

async function listMessagesForActor(actor, conversationIdRaw) {
  const resolved = await findConversationForActor(conversationIdRaw, actor);
  if (!resolved) {
    const error = new Error("Conversation not found.");
    error.statusCode = 404;
    throw error;
  }

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: resolved.conversation.id },
    orderBy: { createdAt: "asc" },
    include: { attachments: true },
  });

  return {
    conversation: mapConversation(resolved.conversation, { actor }),
    messages: messages.map((message) =>
      mapMessage(message, {
        actorType: actor.type,
        accessCode: actor.organizerAccessCode,
        clientAccessToken: actor.clientAccessToken,
      }),
    ),
  };
}

async function sendMessageForActor(actor, conversationIdRaw, payload = {}) {
  const resolved = await findConversationForActor(conversationIdRaw, actor);
  if (!resolved) {
    const error = new Error("Conversation not found.");
    error.statusCode = 404;
    throw error;
  }

  if (resolved.conversation.status === CHAT_CONVERSATION_STATUS.CLOSED) {
    const error = new Error("Conversation is closed.");
    error.statusCode = 400;
    throw error;
  }

  const messageText = normalizeText(payload.message || payload.body || "", 4000);
  const file = payload.file || null;
  const legacyDataUrl = normalizeText(payload.legacyDataUrl || "", 1_500_000);

  if (!messageText && !file && !legacyDataUrl) {
    const error = new Error("Message or attachment is required.");
    error.statusCode = 400;
    throw error;
  }

  const attachmentMeta = file
    ? await saveChatAttachment({ conversationId: resolved.conversation.id, file })
    : null;

  const messageType = attachmentMeta || legacyDataUrl
    ? (messageText ? CHAT_MESSAGE_TYPE.TEXT_WITH_ATTACHMENT : CHAT_MESSAGE_TYPE.ATTACHMENT_ONLY)
    : CHAT_MESSAGE_TYPE.TEXT;

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.create({
      data: {
        conversationId: resolved.conversation.id,
        senderType: actor.type,
        senderOrganizerAccessCode: actor.type === CHAT_ACTOR.ORGANIZER ? actor.organizerAccessCode : null,
        senderClientAccessToken: actor.type === CHAT_ACTOR.CLIENT ? actor.clientAccessToken : null,
        body: messageText,
        messageType,
      },
      include: { attachments: true },
    });

    let attachment = null;
    if (attachmentMeta) {
      attachment = await tx.chatAttachment.create({
        data: {
          messageId: message.id,
          kind: attachmentMeta.kind,
          storageType: "LOCAL_FILE",
          mimeType: attachmentMeta.mimeType,
          originalName: attachmentMeta.originalName,
          storageKey: attachmentMeta.storageKey,
          sizeBytes: attachmentMeta.sizeBytes,
        },
      });
    } else if (legacyDataUrl) {
      attachment = await tx.chatAttachment.create({
        data: {
          messageId: message.id,
          kind: "IMAGE",
          storageType: "LEGACY_DATA_URL",
          mimeType: "image/webp",
          originalName: "legacy-image",
          storageKey: null,
          legacyDataUrl,
          sizeBytes: legacyDataUrl.length,
        },
      });
    }

    await tx.chatConversation.update({
      where: { id: resolved.conversation.id },
      data: {
        lastMessageAt: message.createdAt,
        status: CHAT_CONVERSATION_STATUS.OPEN,
      },
    });

    return {
      ...message,
      attachments: attachment ? [attachment] : [],
    };
  });

  let finalMessage = created;

  // Email notification: when organizer sends a message to a client, notify by email
  // Track status synchronously so we can store and expose it.
  if (
    actor.type === CHAT_ACTOR.ORGANIZER &&
    resolved.conversation.conversationType === CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT &&
    resolved.conversation.ticketRequestId
  ) {
    let emailStatus = CHAT_MESSAGE_EMAIL_STATUS.NO_EMAIL;
    try {
      const ticketRequest = await prisma.ticketRequest.findUnique({
        where: { id: resolved.conversation.ticketRequestId },
        select: { email: true, clientProfile: { select: { clientAccessToken: true } }, event: { select: { eventName: true } } },
      });
      const token679 = ticketRequest?.clientProfile?.clientAccessToken;
      if (ticketRequest?.email && token679) {
        const dashboardUrl = `${getPublicBaseUrl()}/client/${token679}`;
        try {
          await sendNewChatMessageEmail({
            to: ticketRequest.email,
            eventName: ticketRequest.event?.eventName || "",
            dashboardUrl,
          });
          emailStatus = CHAT_MESSAGE_EMAIL_STATUS.SENT;
        } catch {
          emailStatus = CHAT_MESSAGE_EMAIL_STATUS.FAILED;
        }
      }
    } catch {
      emailStatus = CHAT_MESSAGE_EMAIL_STATUS.FAILED;
    }
    finalMessage = await prisma.chatMessage.update({
      where: { id: created.id },
      data: { emailStatus },
      include: { attachments: true },
    });
  }

  // Email notification: when client sends a message to organizer, notify organizer by email
  if (
    actor.type === CHAT_ACTOR.CLIENT &&
    resolved.conversation.conversationType === CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT &&
    resolved.conversation.event?.id
  ) {
    prisma.userEvent.findUnique({
      where: { id: resolved.conversation.event.id },
      select: { organizerEmail: true, notifyOnMessage: true, organizerAccessCode: true, accessCode: true },
    }).then((event) => {
      if (event?.organizerEmail && event?.notifyOnMessage) {
        const codeForUrl = event.organizerAccessCode || event.accessCode;
        const dashboardUrl = `${getPublicBaseUrl()}/dashboard?code=${encodeURIComponent(codeForUrl)}&menu=chat`;
        sendOrganizerNewMessageEmail({
          to: event.organizerEmail,
          eventName: resolved.conversation.event.eventName || "",
          senderName: resolved.conversation.ticketRequest?.name || "A customer",
          dashboardUrl,
        }).catch((err) => console.error("organizer chat notify failed", err));
      }
    }).catch(() => {});
  }

  const mappedMessage = mapMessage(finalMessage, {
    actorType: actor.type,
    accessCode: actor.organizerAccessCode,
    clientAccessToken: actor.clientAccessToken,
  });

  // Emit real-time event to all sockets in the conversation room
  const io = socketManager.getIo();
  if (io) {
    io.to(`conv:${resolved.conversation.id}`).emit("new_message", mappedMessage);
  }

  return mappedMessage;
}

async function markConversationReadForActor(actor, conversationIdRaw, readThroughMessageIdRaw = "") {
  const resolved = await findConversationForActor(conversationIdRaw, actor);
  if (!resolved) {
    const error = new Error("Conversation not found.");
    error.statusCode = 404;
    throw error;
  }

  let readAt = new Date();
  const readThroughMessageId = String(readThroughMessageIdRaw || "").trim();
  if (readThroughMessageId) {
    const targetMessage = await prisma.chatMessage.findFirst({
      where: {
        id: readThroughMessageId,
        conversationId: resolved.conversation.id,
      },
      select: { createdAt: true },
    });
    if (targetMessage?.createdAt) readAt = targetMessage.createdAt;
  }

  if (resolved.party === "A") {
    await prisma.chatConversation.update({
      where: { id: resolved.conversation.id },
      data: { partyAReadAt: readAt },
    });
  } else {
    await prisma.chatConversation.update({
      where: { id: resolved.conversation.id },
      data: { partyBReadAt: readAt },
    });
  }

  return { conversationId: resolved.conversation.id, readAt };
}

async function updateConversationStatusForAdmin(conversationIdRaw, statusRaw) {
  const conversationId = String(conversationIdRaw || "").trim();
  const status = String(statusRaw || "").trim().toUpperCase();
  if (!conversationId || (status !== CHAT_CONVERSATION_STATUS.OPEN && status !== CHAT_CONVERSATION_STATUS.CLOSED)) {
    const error = new Error("Conversation id and valid status are required.");
    error.statusCode = 400;
    throw error;
  }

  const updated = await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { status },
    include: {
      event: { select: { id: true, eventName: true, organizerName: true } },
      ticketRequest: { select: { id: true, status: true, name: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { attachments: true },
      },
    },
  });

  const unreadCount = await countUnreadForConversation(updated, resolvePartyForActor(updated, { type: CHAT_ACTOR.ADMIN }));
  return mapConversation(updated, { actor: { type: CHAT_ACTOR.ADMIN }, unreadCount });
}

async function findAttachmentForActor(actor, attachmentIdRaw) {
  const attachmentId = String(attachmentIdRaw || "").trim();
  if (!attachmentId) return null;

  const attachment = await prisma.chatAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      message: {
        include: {
          conversation: true,
        },
      },
    },
  });
  if (!attachment?.message?.conversation) return null;

  const party = resolvePartyForActor(attachment.message.conversation, actor);
  if (!party) return null;

  return attachment;
}

/**
 * Send a SYSTEM message to the ORGANIZER_CLIENT conversation for a ticket request,
 * optionally send an email, and track delivery status on the message.
 *
 * @param {object} opts
 * @param {string} opts.ticketRequestId
 * @param {string} opts.body - Text of the system message
 * @param {string} [opts.emailFn] - Async function ({ to, eventName, ... }) => Promise, or null
 * @param {object} [opts.emailArgs] - Extra args merged into email call (to, eventName, dashboardUrl, etc.)
 * @returns {Promise<object|null>} mapped message or null on failure
 */
async function sendSystemMessageForTicketRequest({ ticketRequestId, body, emailFn = null, emailArgs = {}, evidenceDataUrl = null, evidenceS3Key = null }) {
  try {
    const context = await resolveTicketRequestContext(ticketRequestId);
    if (!context) return null;

    const conversationId = await ensureOrganizerClientConversationByRequestId(ticketRequestId);

    // Determine email status before creating the message
    let emailStatus = CHAT_MESSAGE_EMAIL_STATUS.NO_EMAIL;
    const ticketRequest = await prisma.ticketRequest.findUnique({
      where: { id: ticketRequestId },
      select: { email: true, clientProfile: { select: { clientAccessToken: true } }, event: { select: { eventName: true } } },
    });
    const token849 = ticketRequest?.clientProfile?.clientAccessToken;
    if (emailFn && ticketRequest?.email && token849) {
      const dashboardUrl = emailArgs.dashboardUrl || `${getPublicBaseUrl()}/client/${token849}`;
      try {
        await emailFn({
          to: ticketRequest.email,
          eventName: ticketRequest.event?.eventName || "",
          dashboardUrl,
          ...emailArgs,
        });
        emailStatus = CHAT_MESSAGE_EMAIL_STATUS.SENT;
      } catch {
        emailStatus = CHAT_MESSAGE_EMAIL_STATUS.FAILED;
      }
    }

    const hasEvidence = Boolean(evidenceDataUrl || evidenceS3Key);
    const message = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderType: CHAT_ACTOR.ORGANIZER,
        senderOrganizerAccessCode: context.organizerAccessCode,
        body: String(body || "").trim(),
        messageType: hasEvidence ? CHAT_MESSAGE_TYPE.TEXT_WITH_ATTACHMENT : CHAT_MESSAGE_TYPE.SYSTEM,
        emailStatus,
      },
      include: { attachments: true },
    });

    if (hasEvidence) {
      if (evidenceS3Key) {
        await prisma.chatAttachment.create({
          data: {
            messageId: message.id,
            kind: "IMAGE",
            storageType: "LOCAL_FILE",
            mimeType: "image/webp",
            originalName: "refund-evidence",
            storageKey: evidenceS3Key,
            sizeBytes: 0,
          },
        });
      } else if (evidenceDataUrl) {
        await prisma.chatAttachment.create({
          data: {
            messageId: message.id,
            kind: "IMAGE",
            storageType: "LEGACY_DATA_URL",
            mimeType: "image/webp",
            originalName: "refund-evidence",
            storageKey: null,
            legacyDataUrl: evidenceDataUrl,
            sizeBytes: evidenceDataUrl.length,
          },
        });
      }
    }

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt, status: CHAT_CONVERSATION_STATUS.OPEN },
    });

    const messageWithAttachments = await prisma.chatMessage.findUnique({
      where: { id: message.id },
      include: { attachments: true },
    });

    const mappedMessage = mapMessage(messageWithAttachments, {
      actorType: CHAT_ACTOR.ORGANIZER,
      accessCode: context.organizerAccessCode,
    });

    const io = socketManager.getIo();
    if (io) {
      io.to(`conv:${conversationId}`).emit("new_message", mappedMessage);
    }

    return mappedMessage;
  } catch {
    return null;
  }
}

async function getLegacySupportConversationByToken(tokenRaw) {
  const token = normalizeText(tokenRaw, 120);
  if (!token) return null;
  return prisma.chatConversation.findFirst({
    where: { legacySupportConversationToken: token },
    include: {
      event: { select: { id: true, eventName: true, organizerName: true } },
      ticketRequest: { select: { id: true, status: true, name: true } },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { attachments: true },
      },
    },
  });
}

async function ensureLegacySupportConversation({ displayName, email, accessCodeRaw, subject }) {
  const organizerScope = await resolveOrganizerScope(accessCodeRaw);
  if (organizerScope) {
    const conversationId = await ensureOrganizerAdminConversation({
      organizerAccessCode: organizerScope.organizerAccessCode,
      eventId: organizerScope.defaultEventId,
      subject: subject || `Organizer support (${displayName || email || organizerScope.organizerAccessCode})`,
    });

    const conversation = await prisma.chatConversation.findUnique({ where: { id: conversationId } });
    if (conversation && !conversation.legacySupportConversationToken) {
      const token = createClientSupportToken();
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { legacySupportConversationToken: token },
      });
    }

    return prisma.chatConversation.findUnique({ where: { id: conversationId } });
  }

  const clientAccessToken = createClientSupportToken();
  const conversationId = await ensureAdminClientConversation({
    clientAccessToken,
    subject: subject || `Client support (${displayName || email || "visitor"})`,
    legacySupportConversationToken: clientAccessToken,
  });

  return prisma.chatConversation.findUnique({ where: { id: conversationId } });
}

module.exports = {
  CHAT_ACTOR,
  CHAT_CONVERSATION_TYPE,
  CHAT_CONVERSATION_STATUS,
  CHAT_MESSAGE_TYPE,
  CHAT_MESSAGE_EMAIL_STATUS,
  resolveActorFromOrganizer,
  sendSystemMessageForTicketRequest,
  resolveActorFromClient,
  resolvePartyForActor,
  mapConversation,
  mapMessage,
  createClientSupportToken,
  resolveOrganizerScope,
  resolveTicketRequestContext,
  startConversationForActor,
  listConversationsForActor,
  listMessagesForActor,
  sendMessageForActor,
  markConversationReadForActor,
  updateConversationStatusForAdmin,
  findConversationForActor,
  findAttachmentForActor,
  getLegacySupportConversationByToken,
  ensureLegacySupportConversation,
  resolveAttachmentAbsolutePath,
};
