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
const { sendContactSupportEmail, sendOtpEmail } = require("../utils/mailer");

const router = express.Router();

// In-memory store for contact-form OTPs and used emails
// { email -> { code, expiresAt } }
const contactOtpStore = new Map();
// Set of emails that have already successfully submitted a support message
const contactUsedEmails = new Set();

router.post("/events", createLiveEvent);
router.post("/demo/events", createDemoEvent);
router.get("/events/by-code/:accessCode", getEventByCode);
router.post("/events/by-code/:accessCode/create-new", createEventForAccessCode);
router.post("/events/by-code/:accessCode/generate-tickets", generateTicketsByAccessCode);
router.patch("/events/:eventId", updateEventInline);
router.get("/events/:eventId/tickets", getEventTickets);
router.get("/tickets/:ticketPublicId", getTicketByPublicId);
router.get("/tickets/public/:ticketPublicId", getPublicTicketByPublicId);
router.post("/scans", scanTicket);

router.get("/public/events/:eventSlug", getPublicEventBySlug);
router.post("/public/send-otp", sendOtp);
router.post("/public/verify-otp", verifyOtp);
router.post("/public/ticket-request", createPublicTicketRequest);
router.get("/public/client-dashboard/:clientAccessToken", getClientDashboardByToken);
router.get("/public/client-dashboard/:clientAccessToken/messages", getClientRequestMessagesByToken);
router.post("/public/client-dashboard/:clientAccessToken/messages", createClientRequestMessageByToken);
router.get("/public/client-dashboard/:clientAccessToken/chat/conversations", clientListConversations);
router.post("/public/client-dashboard/:clientAccessToken/chat/conversations", clientStartConversation);
router.get("/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/messages", clientGetConversationMessages);
router.post(
  "/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/messages",
  chatAttachmentUpload,
  clientSendConversationMessage,
);
router.post("/public/client-dashboard/:clientAccessToken/chat/conversations/:conversationId/read", clientMarkConversationRead);
router.get("/public/client-dashboard/:clientAccessToken/chat/attachments/:attachmentId", clientDownloadAttachment);
router.post("/public/recover-client-token/send-otp", sendRecoveryOtp);
router.post("/public/recover-client-token/confirm", confirmRecoveryOtp);
router.post("/public/recover-organizer-code/send-otp", sendOrganizerRecoveryOtp);
router.post("/public/recover-organizer-code/confirm", confirmOrganizerRecoveryOtp);
router.post("/public/support/conversations", createSupportConversation);
router.get("/public/support/conversations/:conversationToken/messages", getSupportConversationMessages);
router.post("/public/support/conversations/:conversationToken/messages", sendSupportConversationMessage);
router.post("/public/contact/send-otp", async (req, res) => {
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
    console.error("Contact OTP email failed:", err);
    return res.status(500).json({ error: "Failed to send verification code. Please try again." });
  }
});

router.post("/public/contact", async (req, res) => {
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
    console.error("Contact support email failed:", err);
    return res.status(500).json({ error: "Failed to send message. Please try again." });
  }
});

router.get("/events/by-code/:accessCode/ticket-requests", getOrganizerTicketRequests);
router.get("/events/by-code/:accessCode/auto-approve", getEventAutoApprove);
router.patch("/events/by-code/:accessCode/auto-approve", setEventAutoApprove);
router.get("/events/by-code/:accessCode/notifications", getOrganizerNotifications);
router.patch("/events/by-code/:accessCode/notifications", updateOrganizerNotifications);
router.post("/events/by-code/:accessCode/notifications/send-email-otp", sendNotificationEmailOtp);
router.post("/events/by-code/:accessCode/notifications/verify-email-otp", verifyNotificationEmailOtp);
router.post("/events/by-code/:accessCode/merge-event", mergeOrphanEvent);
router.post("/ticket-requests/:id/approve", approveTicketRequest);
router.post("/ticket-requests/:id/reject", rejectTicketRequest);
router.post("/ticket-requests/:id/message", messageTicketRequest);
router.post("/tickets/:ticketPublicId/cancel", cancelOrganizerTicket);
router.get("/ticket-requests/:id/messages", getTicketRequestMessages);
router.post("/ticket-requests/:id/messages", chatAttachmentUpload, sendTicketRequestMessage);
router.get("/events/by-code/:accessCode/chat/conversations", organizerListConversations);
router.post("/events/by-code/:accessCode/chat/conversations", organizerStartConversation);
router.get("/events/by-code/:accessCode/chat/conversations/:conversationId/messages", organizerGetConversationMessages);
router.post(
  "/events/by-code/:accessCode/chat/conversations/:conversationId/messages",
  chatAttachmentUpload,
  organizerSendConversationMessage,
);
router.post("/events/by-code/:accessCode/chat/conversations/:conversationId/read", organizerMarkConversationRead);
router.get("/events/by-code/:accessCode/chat/attachments/:attachmentId", organizerDownloadAttachment);

router.get("/events/by-code/:accessCode/promoters", listPromoters);
router.post("/promoters", createPromoter);
router.patch("/promoters/:id", updatePromoter);
router.delete("/promoters/:id", deletePromoter);

router.use("/admin", adminRoutes);

module.exports = router;
