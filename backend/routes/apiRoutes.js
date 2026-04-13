const express = require("express");
const {
  createLiveEvent,
  createDemoEvent,
  createEventForAccessCode,
  getEventByCode,
  getEventTickets,
  generateTicketsByAccessCode,
  updateEventInline,
  getOrganizerNotifications,
  updateOrganizerNotifications,
  sendNotificationEmailOtp,
  verifyNotificationEmailOtp,
  sendOrganizerNotificationTestEmail,
  submitOrganizerInvoicePaymentEvidence,
  listOrganizerInvoicePaymentEvidence,
  mergeOrphanEvent,
} = require("../controllers/eventController");
const { scanTicket } = require("../controllers/scanController");
const { getTicketByPublicId, getPublicTicketByPublicId } = require("../controllers/ticketController");
const adminRoutes = require("./adminRoutes");
const {
  getPublicEventBySlug,
  sendOtp,
  verifyOtp,
  createPublicTicketRequest,
  getClientDashboardByToken,
  sendRecoveryOtp,
  confirmRecoveryOtp,
  sendOrganizerRecoveryOtp,
  confirmOrganizerRecoveryOtp,
} = require("../controllers/publicController");
const {
  getOrganizerTicketRequests,
  approveTicketRequest,
  rejectTicketRequest,
  messageTicketRequest,
  cancelOrganizerTicket,
  listPromoters,
  createPromoter,
  updatePromoter,
  deletePromoter,
  getEventAutoApprove,
  setEventAutoApprove,
} = require("../controllers/organizerController");
const {
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
  createSupportConversation,
  getSupportConversationMessages,
  sendSupportConversationMessage,
  getTicketRequestMessages,
  sendTicketRequestMessage,
  getClientRequestMessagesByToken,
  createClientRequestMessageByToken,
} = require("../controllers/chatController");
const { chatAttachmentUpload } = require("../middleware/chatUpload");
const { validateRequest } = require("../middleware/validate");
const { sendContactSupportEmail, sendOtpEmail } = require("../utils/mailer");
const logger = require("../utils/logger");
const {
  accessCodeParamSchema,
  eventIdParamSchema,
  ticketPublicIdParamSchema,
  eventSlugParamSchema,
  clientTokenParamSchema,
  conversationIdParamSchema,
  attachmentIdParamSchema,
  supportTokenParamSchema,
  sendOtpBodySchema,
  verifyOtpBodySchema,
  ticketRequestBodySchema,
  clientMessageBodySchema,
  clientStartConversationBodySchema,
  readConversationBodySchema,
  recoverSendOtpBodySchema,
  recoverConfirmBodySchema,
  supportCreateBodySchema,
  supportMessageBodySchema,
  contactSendOtpBodySchema,
  contactBodySchema,
  scanBodySchema,
  createEventBodySchema,
  createEventByCodeParamsSchema,
  createEventByCodeBodySchema,
  generateTicketsParamsSchema,
  generateTicketsBodySchema,
  updateEventParamsSchema,
  updateEventBodySchema,
  organizerEventQuerySchema,
  accessCodeWithEventParamsSchema,
  setAutoApproveBodySchema,
  updateNotificationsBodySchema,
  notificationSendOtpBodySchema,
  notificationVerifyOtpBodySchema,
  notificationTestBodySchema,
  mergeEventBodySchema,
  ticketRequestIdParamSchema,
  ticketRequestActionBodySchema,
  ticketRequestMessageBodySchema,
  organizerTicketCancelBodySchema,
  organizerStartConversationBodySchema,
  organizerConversationParamsSchema,
  organizerAttachmentParamsSchema,
  organizerInvoiceEvidenceParamsSchema,
  organizerInvoiceEvidenceBodySchema,
  organizerConversationMessageBodySchema,
  promoterIdParamSchema,
  promotersCreateBodySchema,
  promotersUpdateBodySchema,
  promotersDeleteQuerySchema,
  promotersDeleteBodySchema,
} = require("../schemas/publicSchemas");

const router = express.Router();

// In-memory store for contact-form OTPs and used emails
// { email -> { code, expiresAt } }
const contactOtpStore = new Map();
// Set of emails that have already successfully submitted a support message
const contactUsedEmails = new Set();

router.post("/events", validateRequest({ body: createEventBodySchema }), createLiveEvent);
router.post("/demo/events", validateRequest({ body: createEventBodySchema }), createDemoEvent);
router.get("/events/by-code/:accessCode", validateRequest({ params: accessCodeParamSchema }), getEventByCode);
router.post(
  "/events/by-code/:accessCode/create-new",
  validateRequest({ params: createEventByCodeParamsSchema, body: createEventByCodeBodySchema }),
  createEventForAccessCode,
);
router.post(
  "/events/by-code/:accessCode/generate-tickets",
  validateRequest({ params: generateTicketsParamsSchema, body: generateTicketsBodySchema }),
  generateTicketsByAccessCode,
);
router.patch("/events/:eventId", validateRequest({ params: updateEventParamsSchema, body: updateEventBodySchema }), updateEventInline);
router.get("/events/:eventId/tickets", validateRequest({ params: eventIdParamSchema }), getEventTickets);
router.get("/tickets/:ticketPublicId", validateRequest({ params: ticketPublicIdParamSchema }), getTicketByPublicId);
router.get("/tickets/public/:ticketPublicId", validateRequest({ params: ticketPublicIdParamSchema }), getPublicTicketByPublicId);
router.post("/scans", validateRequest({ body: scanBodySchema }), scanTicket);

router.get("/public/events/:eventSlug", validateRequest({ params: eventSlugParamSchema }), getPublicEventBySlug);
router.post("/public/send-otp", validateRequest({ body: sendOtpBodySchema }), sendOtp);
router.post("/public/verify-otp", validateRequest({ body: verifyOtpBodySchema }), verifyOtp);
router.post("/public/ticket-request", validateRequest({ body: ticketRequestBodySchema }), createPublicTicketRequest);
router.get("/public/client-dashboard/:clientAccessToken", validateRequest({ params: clientTokenParamSchema }), getClientDashboardByToken);
router.get("/public/client-dashboard/:clientAccessToken/messages", validateRequest({ params: clientTokenParamSchema }), getClientRequestMessagesByToken);
router.post("/public/client-dashboard/:clientAccessToken/messages", validateRequest({ params: clientTokenParamSchema, body: clientMessageBodySchema }), createClientRequestMessageByToken);
router.get("/public/client-dashboard/:clientAccessToken/chat/conversations", validateRequest({ params: clientTokenParamSchema }), clientListConversations);
router.post("/public/client-dashboard/:clientAccessToken/chat/conversations", validateRequest({ params: clientTokenParamSchema, body: clientStartConversationBodySchema }), clientStartConversation);
router.get(
  "/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/messages",
  validateRequest({ params: conversationIdParamSchema }),
  clientGetConversationMessages,
);
router.post(
  "/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/messages",
  validateRequest({ params: conversationIdParamSchema }),
  chatAttachmentUpload,
  clientSendConversationMessage,
);
router.post(
  "/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/read",
  validateRequest({ params: conversationIdParamSchema, body: readConversationBodySchema }),
  clientMarkConversationRead,
);
router.get(
  "/public/client-dashboard/:clientAccessToken/chat/attachments/:attachmentId",
  validateRequest({ params: attachmentIdParamSchema }),
  clientDownloadAttachment,
);
router.post("/public/recover-client-token/send-otp", validateRequest({ body: recoverSendOtpBodySchema }), sendRecoveryOtp);
router.post("/public/recover-client-token/confirm", validateRequest({ body: recoverConfirmBodySchema }), confirmRecoveryOtp);
router.post("/public/recover-organizer-code/send-otp", validateRequest({ body: recoverSendOtpBodySchema }), sendOrganizerRecoveryOtp);
router.post("/public/recover-organizer-code/confirm", validateRequest({ body: recoverConfirmBodySchema }), confirmOrganizerRecoveryOtp);
router.post("/public/support/conversations", validateRequest({ body: supportCreateBodySchema }), createSupportConversation);
router.get(
  "/public/support/conversations/:conversationToken/messages",
  validateRequest({ params: supportTokenParamSchema }),
  getSupportConversationMessages,
);
router.post(
  "/public/support/conversations/:conversationToken/messages",
  validateRequest({ params: supportTokenParamSchema, body: supportMessageBodySchema }),
  sendSupportConversationMessage,
);
router.post("/public/contact/send-otp", validateRequest({ body: contactSendOtpBodySchema }), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Email is required." });

  if (contactUsedEmails.has(email)) {
    return res.status(409).json({ duplicate: true });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min
  contactOtpStore.set(email, { code, expiresAt });

  try {
    await sendOtpEmail({ to: email, code, eventName: null });
    return res.json({ ok: true });
  } catch (err) {
    logger.error("Contact OTP email failed:", err);
    return res.status(500).json({ error: "Failed to send verification code. Please try again." });
  }
});

router.post("/public/contact", validateRequest({ body: contactBodySchema }), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const message = String(req.body?.message || "").trim();
  const otp = String(req.body?.otp || "").trim();

  if (!email || !message || !otp) {
    return res.status(400).json({ error: "Email, message, and verification code are required." });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: "Message is too long." });
  }

  if (contactUsedEmails.has(email)) {
    return res.status(409).json({ duplicate: true });
  }

  const record = contactOtpStore.get(email);
  if (!record) {
    return res.status(400).json({ error: "No verification code was sent to this email. Please request a new code." });
  }
  if (Date.now() > record.expiresAt) {
    contactOtpStore.delete(email);
    return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
  }
  if (record.code !== otp) {
    return res.status(400).json({ error: "Incorrect verification code." });
  }

  contactOtpStore.delete(email);

  try {
    await sendContactSupportEmail({ fromEmail: email, message });
    contactUsedEmails.add(email);
    return res.json({ ok: true });
  } catch (err) {
    logger.error("Contact support email failed:", err);
    return res.status(500).json({ error: "Failed to send message. Please try again." });
  }
});

router.get(
  "/events/by-code/:accessCode/ticket-requests",
  validateRequest({ params: accessCodeWithEventParamsSchema, query: organizerEventQuerySchema }),
  getOrganizerTicketRequests,
);
router.get(
  "/events/by-code/:accessCode/auto-approve",
  validateRequest({ params: accessCodeWithEventParamsSchema, query: organizerEventQuerySchema }),
  getEventAutoApprove,
);
router.patch(
  "/events/by-code/:accessCode/auto-approve",
  validateRequest({ params: accessCodeWithEventParamsSchema, body: setAutoApproveBodySchema }),
  setEventAutoApprove,
);
router.get(
  "/events/by-code/:accessCode/notifications",
  validateRequest({ params: accessCodeWithEventParamsSchema }),
  getOrganizerNotifications,
);
router.patch(
  "/events/by-code/:accessCode/notifications",
  validateRequest({ params: accessCodeWithEventParamsSchema, body: updateNotificationsBodySchema }),
  updateOrganizerNotifications,
);
router.post(
  "/events/by-code/:accessCode/notifications/send-email-otp",
  validateRequest({ params: accessCodeWithEventParamsSchema, body: notificationSendOtpBodySchema }),
  sendNotificationEmailOtp,
);
router.post(
  "/events/by-code/:accessCode/notifications/verify-email-otp",
  validateRequest({ params: accessCodeWithEventParamsSchema, body: notificationVerifyOtpBodySchema }),
  verifyNotificationEmailOtp,
);
router.post(
  "/events/by-code/:accessCode/notifications/send-test",
  validateRequest({ params: accessCodeWithEventParamsSchema, body: notificationTestBodySchema }),
  sendOrganizerNotificationTestEmail,
);
router.post(
  "/events/by-code/:accessCode/merge-event",
  validateRequest({ params: accessCodeWithEventParamsSchema, body: mergeEventBodySchema }),
  mergeOrphanEvent,
);
router.get(
  "/events/by-code/:accessCode/invoices/:invoiceId/payment-evidence",
  validateRequest({ params: organizerInvoiceEvidenceParamsSchema }),
  listOrganizerInvoicePaymentEvidence,
);
router.post(
  "/events/by-code/:accessCode/invoices/:invoiceId/payment-evidence",
  validateRequest({ params: organizerInvoiceEvidenceParamsSchema, body: organizerInvoiceEvidenceBodySchema }),
  submitOrganizerInvoicePaymentEvidence,
);
router.post(
  "/ticket-requests/:id/approve",
  validateRequest({ params: ticketRequestIdParamSchema, body: ticketRequestActionBodySchema, query: organizerEventQuerySchema }),
  approveTicketRequest,
);
router.post(
  "/ticket-requests/:id/reject",
  validateRequest({ params: ticketRequestIdParamSchema, body: ticketRequestActionBodySchema, query: organizerEventQuerySchema }),
  rejectTicketRequest,
);
router.post(
  "/ticket-requests/:id/message",
  validateRequest({ params: ticketRequestIdParamSchema, body: ticketRequestMessageBodySchema, query: organizerEventQuerySchema }),
  messageTicketRequest,
);
router.post(
  "/tickets/:ticketPublicId/cancel",
  validateRequest({ params: ticketPublicIdParamSchema, body: organizerTicketCancelBodySchema, query: organizerEventQuerySchema }),
  cancelOrganizerTicket,
);
router.get(
  "/ticket-requests/:id/messages",
  validateRequest({ params: ticketRequestIdParamSchema, query: organizerEventQuerySchema }),
  getTicketRequestMessages,
);
router.post(
  "/ticket-requests/:id/messages",
  validateRequest({ params: ticketRequestIdParamSchema, body: ticketRequestMessageBodySchema, query: organizerEventQuerySchema }),
  chatAttachmentUpload,
  sendTicketRequestMessage,
);
router.get(
  "/events/by-code/:accessCode/chat/conversations",
  validateRequest({ params: accessCodeWithEventParamsSchema, query: organizerEventQuerySchema }),
  organizerListConversations,
);
router.post(
  "/events/by-code/:accessCode/chat/conversations",
  validateRequest({ params: accessCodeWithEventParamsSchema, body: organizerStartConversationBodySchema }),
  organizerStartConversation,
);
router.get(
  "/events/by-code/:accessCode/chat/conversations/:conversationId/messages",
  validateRequest({ params: organizerConversationParamsSchema }),
  organizerGetConversationMessages,
);
router.post(
  "/events/by-code/:accessCode/chat/conversations/:conversationId/messages",
  validateRequest({ params: organizerConversationParamsSchema, body: organizerConversationMessageBodySchema }),
  chatAttachmentUpload,
  organizerSendConversationMessage,
);
router.post(
  "/events/by-code/:accessCode/chat/conversations/:conversationId/read",
  validateRequest({ params: organizerConversationParamsSchema, body: readConversationBodySchema }),
  organizerMarkConversationRead,
);
router.get(
  "/events/by-code/:accessCode/chat/attachments/:attachmentId",
  validateRequest({ params: organizerAttachmentParamsSchema }),
  organizerDownloadAttachment,
);

router.get(
  "/events/by-code/:accessCode/promoters",
  validateRequest({ params: accessCodeWithEventParamsSchema, query: organizerEventQuerySchema }),
  listPromoters,
);
router.post("/promoters", validateRequest({ body: promotersCreateBodySchema }), createPromoter);
router.patch(
  "/promoters/:id",
  validateRequest({ params: promoterIdParamSchema, body: promotersUpdateBodySchema, query: promotersDeleteQuerySchema }),
  updatePromoter,
);
router.delete(
  "/promoters/:id",
  validateRequest({ params: promoterIdParamSchema, body: promotersDeleteBodySchema, query: promotersDeleteQuerySchema }),
  deletePromoter,
);

router.use("/admin", adminRoutes);

module.exports = router;
