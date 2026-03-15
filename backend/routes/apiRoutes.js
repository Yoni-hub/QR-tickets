const express = require("express");
const {
  createLiveEvent,
  createDemoEvent,
  createEventForAccessCode,
  getEventByCode,
  getEventTickets,
  generateTicketsByAccessCode,
  getTicketsPdf,
  updateEventInline,
} = require("../controllers/eventController");
const { scanTicket } = require("../controllers/scanController");
const { getTicketByPublicId, getPublicTicketByPublicId } = require("../controllers/ticketController");
const { sendOrderTicketLinks } = require("../controllers/orderController");
const adminRoutes = require("./adminRoutes");
const {
  getPublicEventBySlug,
  createPublicTicketRequest,
  getClientDashboardByToken,
  getClientRequestMessagesByToken,
  createClientRequestMessageByToken,
} = require("../controllers/publicController");
const {
  createSupportConversation,
  getSupportConversationMessages,
  sendSupportConversationMessage,
} = require("../controllers/supportController");
const {
  getOrganizerTicketRequests,
  approveTicketRequest,
  rejectTicketRequest,
  messageTicketRequest,
  cancelOrganizerTicket,
  getTicketRequestMessages,
  sendTicketRequestMessage,
  listPromoters,
  createPromoter,
  updatePromoter,
  deletePromoter,
  createGuestAndApprove,
  bulkGuestImport,
} = require("../controllers/organizerController");

const router = express.Router();

router.post("/events", createLiveEvent);
router.post("/demo/events", createDemoEvent);
router.get("/events/by-code/:accessCode", getEventByCode);
router.post("/events/by-code/:accessCode/create-new", createEventForAccessCode);
router.post("/events/by-code/:accessCode/generate-tickets", generateTicketsByAccessCode);
router.patch("/events/:eventId", updateEventInline);
router.get("/events/:eventId/tickets", getEventTickets);
router.get("/events/:eventId/tickets.pdf", getTicketsPdf);
router.get("/tickets/:ticketPublicId", getTicketByPublicId);
router.get("/tickets/public/:ticketPublicId", getPublicTicketByPublicId);
router.post("/orders/:accessCode/send-links", sendOrderTicketLinks);
router.post("/scans", scanTicket);

router.get("/public/events/:eventSlug", getPublicEventBySlug);
router.post("/public/ticket-request", createPublicTicketRequest);
router.get("/public/client-dashboard/:clientAccessToken", getClientDashboardByToken);
router.get("/public/client-dashboard/:clientAccessToken/messages", getClientRequestMessagesByToken);
router.post("/public/client-dashboard/:clientAccessToken/messages", createClientRequestMessageByToken);
router.post("/public/support/conversations", createSupportConversation);
router.get("/public/support/conversations/:conversationToken/messages", getSupportConversationMessages);
router.post("/public/support/conversations/:conversationToken/messages", sendSupportConversationMessage);

router.get("/events/by-code/:accessCode/ticket-requests", getOrganizerTicketRequests);
router.post("/ticket-requests/:id/approve", approveTicketRequest);
router.post("/ticket-requests/:id/reject", rejectTicketRequest);
router.post("/ticket-requests/:id/message", messageTicketRequest);
router.post("/tickets/:ticketPublicId/cancel", cancelOrganizerTicket);
router.get("/ticket-requests/:id/messages", getTicketRequestMessages);
router.post("/ticket-requests/:id/messages", sendTicketRequestMessage);
router.post("/events/by-code/:accessCode/guests", createGuestAndApprove);
router.post("/events/by-code/:accessCode/guests/bulk", bulkGuestImport);

router.get("/events/by-code/:accessCode/promoters", listPromoters);
router.post("/promoters", createPromoter);
router.patch("/promoters/:id", updatePromoter);
router.delete("/promoters/:id", deletePromoter);

router.use("/admin", adminRoutes);

module.exports = router;
