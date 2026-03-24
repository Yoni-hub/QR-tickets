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

const rateLimit = require("express-rate-limit");

// 3 brand-new organizer/event creations per IP per hour
const newEventLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many events created from this device. Try again later." },
});

// 20 add-event-to-existing-organizer per IP per hour (gated by access code, lower risk)
const addEventLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this device. Try again later." },
});

// 10 ticket generation requests per IP per hour
const ticketGenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many ticket generation requests from this device. Try again later." },
});

const router = express.Router();

router.post("/events", newEventLimiter, createLiveEvent);
router.post("/demo/events", newEventLimiter, createDemoEvent);
router.get("/events/by-code/:accessCode", getEventByCode);
router.post("/events/by-code/:accessCode/create-new", addEventLimiter, createEventForAccessCode);
router.post("/events/by-code/:accessCode/generate-tickets", ticketGenLimiter, generateTicketsByAccessCode);
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
router.post("/public/support/conversations", createSupportConversation);
router.get("/public/support/conversations/:conversationToken/messages", getSupportConversationMessages);
router.post("/public/support/conversations/:conversationToken/messages", sendSupportConversationMessage);

router.get("/events/by-code/:accessCode/ticket-requests", getOrganizerTicketRequests);
router.get("/events/by-code/:accessCode/auto-approve", getEventAutoApprove);
router.patch("/events/by-code/:accessCode/auto-approve", setEventAutoApprove);
router.get("/events/by-code/:accessCode/notifications", getOrganizerNotifications);
router.patch("/events/by-code/:accessCode/notifications", updateOrganizerNotifications);
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
