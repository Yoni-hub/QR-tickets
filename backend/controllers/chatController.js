const fs = require("fs");
const path = require("path");
const prisma = require("../utils/prisma");
const { LIMITS, sanitizeText, safeError } = require("../utils/sanitize");
const { isS3Configured, getPresignedUrl } = require("../utils/s3");
const {
  CHAT_ACTOR,
  CHAT_CONVERSATION_TYPE,
  resolveActorFromOrganizer,
  resolveActorFromClient,
  resolvePartyForActor,
  startConversationForActor,
  listConversationsForActor,
  listMessagesForActor,
  sendMessageForActor,
  markConversationReadForActor,
  updateConversationStatusForAdmin,
  findAttachmentForActor,
  getLegacySupportConversationByToken,
  ensureLegacySupportConversation,
  resolveAttachmentAbsolutePath,
} = require("../services/chatService");

function parseStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "OPEN" || normalized === "CLOSED") return normalized;
  return "";
}

function parseConversationType(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (Object.values(CHAT_CONVERSATION_TYPE).includes(normalized)) return normalized;
  return "";
}

function decodeDataUrl(dataUrl) {
  const value = String(dataUrl || "").trim();
  const match = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const base64 = match[2];
  try {
    return {
      mimeType,
      buffer: Buffer.from(base64, "base64"),
    };
  } catch {
    return null;
  }
}

async function sendAttachmentResponse(attachment, res) {
  if (attachment.storageType === "LEGACY_DATA_URL") {
    const decoded = decodeDataUrl(attachment.legacyDataUrl);
    if (!decoded) {
      res.status(404).json({ error: "Attachment data is unavailable." });
      return;
    }
    res.setHeader("Content-Type", decoded.mimeType || attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${attachment.originalName || "attachment"}"`);
    res.status(200).send(decoded.buffer);
    return;
  }

  // LOCAL_FILE: try S3 first (if configured), then fall back to local filesystem
  if (isS3Configured() && attachment.storageKey) {
    const presignedUrl = await getPresignedUrl(attachment.storageKey);
    if (presignedUrl) {
      res.redirect(302, presignedUrl);
      return;
    }
  }

  const absolutePath = resolveAttachmentAbsolutePath(attachment.storageKey);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    res.status(404).json({ error: "Attachment file not found." });
    return;
  }

  const downloadName = path.basename(attachment.originalName || "attachment");
  res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${downloadName}"`);
  res.status(200).sendFile(absolutePath);
}

async function requireOrganizerActor(req, res) {
  const accessCode = String(req.params.accessCode || req.query?.accessCode || req.body?.accessCode || "").trim();
  let actor = await resolveActorFromOrganizer(accessCode);
  if (!actor) {
    const eventId = String(req.query?.eventId || req.body?.eventId || "").trim();
    if (eventId) {
      const event = await prisma.userEvent.findUnique({
        where: { id: eventId },
        select: { id: true, accessCode: true, organizerAccessCode: true },
      });
      if (event) {
        actor = {
          type: CHAT_ACTOR.ORGANIZER,
          organizerAccessCode: event.organizerAccessCode || event.accessCode,
          eventId: event.id,
        };
      }
    }
  }
  if (!actor) {
    res.status(404).json({ error: "Organizer scope not found." });
    return null;
  }
  return actor;
}

function requireClientActor(req, res) {
  const token = String(req.params.clientAccessToken || req.query?.clientAccessToken || req.body?.clientAccessToken || "").trim();
  const actor = resolveActorFromClient(token);
  if (!actor) {
    res.status(400).json({ error: "clientAccessToken is required." });
    return null;
  }
  return actor;
}

function adminActor() {
  return { type: CHAT_ACTOR.ADMIN };
}

async function organizerListConversations(req, res) {
  const actor = await requireOrganizerActor(req, res);
  if (!actor) return;
  try {
    const items = await listConversationsForActor(actor, {
      status: req.query?.status,
      conversationType: req.query?.conversationType,
      q: req.query?.q,
      eventId: req.query?.eventId,
    });
    res.json({ items });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load conversations.") });
  }
}

async function organizerStartConversation(req, res) {
  const actor = await requireOrganizerActor(req, res);
  if (!actor) return;
  try {
    const conversationId = await startConversationForActor(actor, {
      conversationType: req.body?.conversationType,
      ticketRequestId: req.body?.ticketRequestId,
      eventId: req.body?.eventId,
      subject: req.body?.subject,
      organizerAccessCode: actor.organizerAccessCode,
    });
    res.status(201).json({ conversationId });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not start conversation.") });
  }
}

async function organizerGetConversationMessages(req, res) {
  const actor = await requireOrganizerActor(req, res);
  if (!actor) return;
  try {
    const payload = await listMessagesForActor(actor, req.params.conversationId);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load conversation messages.") });
  }
}

async function organizerSendConversationMessage(req, res) {
  const actor = await requireOrganizerActor(req, res);
  if (!actor) return;
  try {
    const message = await sendMessageForActor(actor, req.params.conversationId, {
      message: req.body?.message,
      file: req.file,
    });
    res.status(201).json({ message });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not send message.") });
  }
}

async function organizerMarkConversationRead(req, res) {
  const actor = await requireOrganizerActor(req, res);
  if (!actor) return;
  try {
    const payload = await markConversationReadForActor(actor, req.params.conversationId, req.body?.readThroughMessageId);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not mark conversation as read.") });
  }
}

async function organizerDownloadAttachment(req, res) {
  const actor = await requireOrganizerActor(req, res);
  if (!actor) return;
  try {
    const attachment = await findAttachmentForActor(actor, req.params.attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found." });
      return;
    }
    await sendAttachmentResponse(attachment, res);
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not download attachment.") });
  }
}

async function clientListConversations(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;
  try {
    const items = await listConversationsForActor(actor, {
      status: req.query?.status,
      conversationType: req.query?.conversationType,
      q: req.query?.q,
      eventId: req.query?.eventId,
    });
    res.json({ items });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load conversations.") });
  }
}

async function clientStartConversation(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;
  try {
    const conversationId = await startConversationForActor(actor, {
      conversationType: req.body?.conversationType,
      ticketRequestId: req.body?.ticketRequestId,
      eventId: req.body?.eventId,
      subject: req.body?.subject,
      clientAccessToken: actor.clientAccessToken,
    });
    res.status(201).json({ conversationId });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not start conversation.") });
  }
}

async function clientGetConversationMessages(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;
  try {
    const payload = await listMessagesForActor(actor, req.params.conversationId);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load conversation messages.") });
  }
}

async function clientSendConversationMessage(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;
  try {
    const message = await sendMessageForActor(actor, req.params.conversationId, {
      message: req.body?.message,
      file: req.file,
    });
    res.status(201).json({ message });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not send message.") });
  }
}

async function clientMarkConversationRead(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;
  try {
    const payload = await markConversationReadForActor(actor, req.params.conversationId, req.body?.readThroughMessageId);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not mark conversation as read.") });
  }
}

async function clientDownloadAttachment(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;
  try {
    const attachment = await findAttachmentForActor(actor, req.params.attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found." });
      return;
    }
    await sendAttachmentResponse(attachment, res);
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not download attachment.") });
  }
}

async function adminListConversations(req, res) {
  try {
    const items = await listConversationsForActor(adminActor(), {
      status: req.query?.status,
      conversationType: req.query?.conversationType,
      q: req.query?.q,
      eventId: req.query?.eventId,
    });
    res.json({ items });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load conversations.") });
  }
}

async function adminStartConversation(req, res) {
  try {
    const conversationId = await startConversationForActor(adminActor(), {
      conversationType: req.body?.conversationType,
      ticketRequestId: req.body?.ticketRequestId,
      eventId: req.body?.eventId,
      subject: req.body?.subject,
      organizerAccessCode: req.body?.organizerAccessCode,
      clientAccessToken: req.body?.clientAccessToken,
      legacySupportConversationToken: req.body?.legacySupportConversationToken,
    });
    res.status(201).json({ conversationId });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not start conversation.") });
  }
}

async function adminGetConversationMessages(req, res) {
  try {
    const payload = await listMessagesForActor(adminActor(), req.params.conversationId);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load conversation messages.") });
  }
}

async function adminSendConversationMessage(req, res) {
  try {
    const message = await sendMessageForActor(adminActor(), req.params.conversationId, {
      message: req.body?.message,
      file: req.file,
    });
    res.status(201).json({ message });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not send message.") });
  }
}

async function adminMarkConversationRead(req, res) {
  try {
    const payload = await markConversationReadForActor(adminActor(), req.params.conversationId, req.body?.readThroughMessageId);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not mark conversation as read.") });
  }
}

async function adminUpdateConversationStatus(req, res) {
  try {
    const conversation = await updateConversationStatusForAdmin(req.params.conversationId, req.body?.status);
    res.json({ conversation });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not update conversation status.") });
  }
}

async function adminDownloadAttachment(req, res) {
  try {
    const attachment = await findAttachmentForActor(adminActor(), req.params.attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found." });
      return;
    }
    await sendAttachmentResponse(attachment, res);
  } catch (error) {
    res.status(500).json({ error: safeError(error, "Could not download attachment.") });
  }
}

// Legacy compatibility wrappers
async function createSupportConversation(req, res) {
  const displayName = sanitizeText(req.body?.name, LIMITS.NAME);
  const email = sanitizeText(req.body?.email, LIMITS.EMAIL).toLowerCase();
  const accessCode = String(req.body?.accessCode || "").trim();
  const message = sanitizeText(req.body?.message, LIMITS.MESSAGE);
  const evidenceImageDataUrl = String(req.body?.evidenceImageDataUrl || "").trim();

  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  try {
    const subject = sanitizeText(req.body?.subject, LIMITS.SUBJECT) || `Support (${displayName || email || "visitor"})`;
    const conversation = await ensureLegacySupportConversation({
      displayName,
      email,
      accessCodeRaw: accessCode,
      subject,
    });

    const actor =
      conversation.partyAType === CHAT_ACTOR.ORGANIZER || conversation.partyBType === CHAT_ACTOR.ORGANIZER
        ? {
            type: CHAT_ACTOR.ORGANIZER,
            organizerAccessCode: conversation.partyAType === CHAT_ACTOR.ORGANIZER
              ? conversation.partyAOrganizerAccessCode
              : conversation.partyBOrganizerAccessCode,
          }
        : {
            type: CHAT_ACTOR.CLIENT,
            clientAccessToken: conversation.partyAType === CHAT_ACTOR.CLIENT
              ? conversation.partyAClientAccessToken
              : conversation.partyBClientAccessToken,
          };

    await sendMessageForActor(actor, conversation.id, {
      message,
      legacyDataUrl: evidenceImageDataUrl || "",
    });

    const payload = await listMessagesForActor(actor, conversation.id);
    const conversationToken = conversation.legacySupportConversationToken || actor.clientAccessToken || "";

    res.status(201).json({
      conversation: {
        ...payload.conversation,
        conversationToken,
        displayName,
      },
      messages: payload.messages,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not create support conversation.") });
  }
}

async function getSupportConversationMessages(req, res) {
  const token = String(req.params.conversationToken || "").trim();
  if (!token) {
    res.status(400).json({ error: "conversationToken is required." });
    return;
  }

  try {
    const conversation = await getLegacySupportConversationByToken(token);
    if (!conversation) {
      res.status(404).json({ error: "Support conversation not found." });
      return;
    }

    const actor = conversation.partyAType === CHAT_ACTOR.CLIENT || conversation.partyBType === CHAT_ACTOR.CLIENT
      ? {
          type: CHAT_ACTOR.CLIENT,
          clientAccessToken: conversation.partyAType === CHAT_ACTOR.CLIENT
            ? conversation.partyAClientAccessToken
            : conversation.partyBClientAccessToken,
        }
      : {
          type: CHAT_ACTOR.ORGANIZER,
          organizerAccessCode: conversation.partyAType === CHAT_ACTOR.ORGANIZER
            ? conversation.partyAOrganizerAccessCode
            : conversation.partyBOrganizerAccessCode,
        };

    const payload = await listMessagesForActor(actor, conversation.id);
    res.json({
      conversation: {
        ...payload.conversation,
        conversationToken: token,
      },
      messages: payload.messages,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load support conversation.") });
  }
}

async function sendSupportConversationMessage(req, res) {
  const token = String(req.params.conversationToken || "").trim();
  const message = String(req.body?.message || "").trim();
  const evidenceImageDataUrl = String(req.body?.evidenceImageDataUrl || "").trim();

  if (!token) {
    res.status(400).json({ error: "conversationToken is required." });
    return;
  }
  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  try {
    const conversation = await getLegacySupportConversationByToken(token);
    if (!conversation) {
      res.status(404).json({ error: "Support conversation not found." });
      return;
    }

    const actor = conversation.partyAType === CHAT_ACTOR.CLIENT || conversation.partyBType === CHAT_ACTOR.CLIENT
      ? {
          type: CHAT_ACTOR.CLIENT,
          clientAccessToken: conversation.partyAType === CHAT_ACTOR.CLIENT
            ? conversation.partyAClientAccessToken
            : conversation.partyBClientAccessToken,
        }
      : {
          type: CHAT_ACTOR.ORGANIZER,
          organizerAccessCode: conversation.partyAType === CHAT_ACTOR.ORGANIZER
            ? conversation.partyAOrganizerAccessCode
            : conversation.partyBOrganizerAccessCode,
        };

    const created = await sendMessageForActor(actor, conversation.id, {
      message,
      legacyDataUrl: evidenceImageDataUrl || "",
    });

    res.status(201).json({ message: created });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not send support message.") });
  }
}

async function listAdminSupportConversations(req, res) {
  try {
    const items = await listConversationsForActor(adminActor(), {
      status: parseStatus(req.query?.status),
      q: req.query?.q,
    });

    res.json({
      items: items.map((item) => ({
        ...item,
        unreadVisitorMessages: item.unreadCount,
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load support conversations.") });
  }
}

async function getAdminSupportConversationMessages(req, res) {
  try {
    const payload = await listMessagesForActor(adminActor(), req.params.id);
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load support conversation messages.") });
  }
}

async function sendAdminSupportMessage(req, res) {
  try {
    const message = await sendMessageForActor(adminActor(), req.params.id, {
      message: req.body?.message,
      file: req.file,
      legacyDataUrl: req.body?.evidenceImageDataUrl,
    });
    res.status(201).json({ message });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not send admin support message.") });
  }
}

async function updateAdminSupportConversationStatus(req, res) {
  return adminUpdateConversationStatus({ ...req, params: { conversationId: req.params.id } }, res);
}

async function getTicketRequestMessages(req, res) {
  const requestId = String(req.params.id || "").trim();
  const accessCode = String(req.query?.accessCode || req.body?.accessCode || "").trim();
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "request id and accessCode are required." });
    return;
  }

  const actor = await resolveActorFromOrganizer(accessCode);
  if (!actor) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  try {
    const conversationId = await startConversationForActor(actor, {
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT,
      ticketRequestId: requestId,
    });
    const payload = await listMessagesForActor(actor, conversationId);
    res.json({ requestId, conversationId, messages: payload.messages });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load request messages.") });
  }
}

async function sendTicketRequestMessage(req, res) {
  const requestId = String(req.params.id || "").trim();
  const accessCode = String(req.query?.accessCode || req.body?.accessCode || "").trim();
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "request id and accessCode are required." });
    return;
  }

  const actor = await resolveActorFromOrganizer(accessCode);
  if (!actor) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  try {
    const conversationId = await startConversationForActor(actor, {
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT,
      ticketRequestId: requestId,
    });
    const message = await sendMessageForActor(actor, conversationId, {
      message: req.body?.message,
      file: req.file,
      legacyDataUrl: req.body?.evidenceImageDataUrl,
    });
    res.status(201).json({ message, conversationId });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not send request message.") });
  }
}

async function getClientRequestMessagesByToken(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;

  try {
    const request = await prisma.ticketRequest.findFirst({
      where: { clientAccessToken: actor.clientAccessToken },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!request) {
      res.status(404).json({ error: "Client dashboard not found." });
      return;
    }

    const conversationId = await startConversationForActor(actor, {
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT,
      ticketRequestId: request.id,
    });

    const payload = await listMessagesForActor(actor, conversationId);
    res.json({ requestId: request.id, conversationId, messages: payload.messages });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not load organizer chat.") });
  }
}

async function createClientRequestMessageByToken(req, res) {
  const actor = requireClientActor(req, res);
  if (!actor) return;

  try {
    const request = await prisma.ticketRequest.findFirst({
      where: { clientAccessToken: actor.clientAccessToken },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!request) {
      res.status(404).json({ error: "Client dashboard not found." });
      return;
    }

    const conversationId = await startConversationForActor(actor, {
      conversationType: CHAT_CONVERSATION_TYPE.ORGANIZER_CLIENT,
      ticketRequestId: request.id,
    });

    const message = await sendMessageForActor(actor, conversationId, {
      message: req.body?.message,
      file: req.file,
      legacyDataUrl: req.body?.evidenceImageDataUrl,
    });

    res.status(201).json({ message, conversationId });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: safeError(error, "Could not send organizer message.") });
  }
}

module.exports = {
  organizerListConversations,
  organizerStartConversation,
  organizerGetConversationMessages,
  organizerSendConversationMessage,
  organizerMarkConversationRead,
  organizerDownloadAttachment,
  clientListConversations,
  clientStartConversation,
  clientGetConversationMessages,
  clientSendConversationMessage,
  clientMarkConversationRead,
  clientDownloadAttachment,
  adminListConversations,
  adminStartConversation,
  adminGetConversationMessages,
  adminSendConversationMessage,
  adminMarkConversationRead,
  adminUpdateConversationStatus,
  adminDownloadAttachment,
  createSupportConversation,
  getSupportConversationMessages,
  sendSupportConversationMessage,
  listAdminSupportConversations,
  getAdminSupportConversationMessages,
  sendAdminSupportMessage,
  updateAdminSupportConversationStatus,
  getTicketRequestMessages,
  sendTicketRequestMessage,
  getClientRequestMessagesByToken,
  createClientRequestMessageByToken,
};
