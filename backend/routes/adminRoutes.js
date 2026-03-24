const express = require("express");
const {
  getAdminOverview,
  listAdminEvents,
  getAdminEventDetail,
  listAdminTickets,
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
  adminListConversations,
  adminStartConversation,
  adminGetConversationMessages,
  adminSendConversationMessage,
  adminMarkConversationRead,
  adminUpdateConversationStatus,
  adminDownloadAttachment,
  listAdminSupportConversations,
  getAdminSupportConversationMessages,
  sendAdminSupportMessage,
  updateAdminSupportConversationStatus,
} = require("../controllers/chatController");
const { chatAttachmentUpload } = require("../middleware/chatUpload");

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

router.get("/chat/conversations", adminListConversations);
router.post("/chat/conversations", adminStartConversation);
router.get("/chat/conversations/:conversationId/messages", adminGetConversationMessages);
router.post("/chat/conversations/:conversationId/messages", chatAttachmentUpload, adminSendConversationMessage);
router.post("/chat/conversations/:conversationId/read", adminMarkConversationRead);
router.patch("/chat/conversations/:conversationId/status", adminUpdateConversationStatus);
router.get("/chat/attachments/:attachmentId", adminDownloadAttachment);

// Compatibility aliases for existing /admin/support UI/API usage.
router.get("/support/conversations", listAdminSupportConversations);
router.get("/support/conversations/:id/messages", getAdminSupportConversationMessages);
router.post("/support/conversations/:id/messages", chatAttachmentUpload, sendAdminSupportMessage);
router.patch("/support/conversations/:id/status", updateAdminSupportConversationStatus);

module.exports = router;
