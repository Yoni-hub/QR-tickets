const express = require("express");
const {
  createLiveEvent,
  createDemoEvent,
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
} = require("../controllers/publicController");
const {
  getOrganizerTicketRequests,
  approveTicketRequest,
  rejectTicketRequest,
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

router.get("/events/by-code/:accessCode/ticket-requests", getOrganizerTicketRequests);
router.post("/ticket-requests/:id/approve", approveTicketRequest);
router.post("/ticket-requests/:id/reject", rejectTicketRequest);
router.post("/events/by-code/:accessCode/guests", createGuestAndApprove);
router.post("/events/by-code/:accessCode/guests/bulk", bulkGuestImport);

router.get("/events/by-code/:accessCode/promoters", listPromoters);
router.post("/promoters", createPromoter);
router.patch("/promoters/:id", updatePromoter);
router.delete("/promoters/:id", deletePromoter);

router.use("/admin", adminRoutes);

module.exports = router;
