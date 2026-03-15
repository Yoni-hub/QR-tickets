const express = require("express");
const {
  getAdminOverview,
  listAdminEvents,
  getAdminEventDetail,
  listAdminTickets,
  listAdminDeliveries,
  listAdminScans,
  listAdminOrganizers,
  getAdminSettings,
  listAdminAuditLog,
  listAdminClientDashTokens,
  disableAdminEvent,
  enableAdminEvent,
  archiveAdminEvent,
  rotateAdminEventAccessCode,
  invalidateAdminTicket,
  restoreAdminTicket,
  resetAdminTicketUsage,
  retryAdminDelivery,
  markScanSuspicious,
} = require("../controllers/adminController");
const { requireAdminAccess } = require("../middleware/adminAuth");
const {
  getOrganizerTicketRequests,
  approveTicketRequest,
  rejectTicketRequest,
  listPromoters,
  createPromoter,
  updatePromoter,
  deletePromoter,
} = require("../controllers/organizerController");
const {
  listAdminSupportConversations,
  getAdminSupportConversationMessages,
  sendAdminSupportMessage,
  updateAdminSupportConversationStatus,
} = require("../controllers/supportController");

const router = express.Router();

router.use(requireAdminAccess);

router.get("/overview", getAdminOverview);
router.get("/events", listAdminEvents);
router.get("/events/:eventId", getAdminEventDetail);
router.patch("/events/:eventId/disable", disableAdminEvent);
router.patch("/events/:eventId/enable", enableAdminEvent);
router.patch("/events/:eventId/archive", archiveAdminEvent);
router.patch("/events/:eventId/rotate-access-code", rotateAdminEventAccessCode);

router.get("/tickets", listAdminTickets);
router.patch("/tickets/:ticketPublicId/invalidate", invalidateAdminTicket);
router.patch("/tickets/:ticketPublicId/restore", restoreAdminTicket);
router.patch("/tickets/:ticketPublicId/reset-usage", resetAdminTicketUsage);

router.get("/deliveries", listAdminDeliveries);
router.post("/deliveries/:deliveryId/retry", retryAdminDelivery);

router.get("/scans", listAdminScans);
router.patch("/scans/:scanId/mark-suspicious", markScanSuspicious);
router.get("/organizers", listAdminOrganizers);

router.get("/settings", getAdminSettings);
router.get("/audit-log", listAdminAuditLog);
router.get("/client-dash-tokens", listAdminClientDashTokens);

// Requested aliases for club/manual ticketing flows.
router.get("/ticket-requests", getOrganizerTicketRequests);
router.post("/ticket-requests/:id/approve", approveTicketRequest);
router.post("/ticket-requests/:id/reject", rejectTicketRequest);
router.post("/promoters", createPromoter);
router.get("/promoters", listPromoters);
router.patch("/promoters/:id", updatePromoter);
router.delete("/promoters/:id", deletePromoter);
router.get("/support/conversations", listAdminSupportConversations);
router.get("/support/conversations/:id/messages", getAdminSupportConversationMessages);
router.post("/support/conversations/:id/messages", sendAdminSupportMessage);
router.patch("/support/conversations/:id/status", updateAdminSupportConversationStatus);

module.exports = router;
