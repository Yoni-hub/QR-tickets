const express = require("express");
const {
  getAdminOverview,
  listAdminEvents,
  getAdminEventDetail,
  listAdminTickets,
  listAdminScans,
  listAdminOrganizers,
  listAdminInvoices,
  getAdminSettings,
  getAdminPaymentInstructions,
  lookupAdminOtpRecords,
  patchAdminPaymentInstructions,
  listAdminAuditLog,
  listAdminClientDashTokens,
  disableAdminEvent,
  enableAdminEvent,
  archiveAdminEvent,
  rotateAdminEventAccessCode,
  lockAdminScanner,
  unlockAdminScanner,
  invalidateAdminTicket,
  restoreAdminTicket,
  resetAdminTicketUsage,
  markScanSuspicious,
  markAdminInvoicePaid,
  addAdminInvoicePayment,
  retryAdminInvoiceDelivery,
  approveAdminInvoicePaymentEvidence,
  sendAdminEvidenceNotifyTest,
  adminPerfCreateEventByOrganizerCode,
  patchAdminInvoiceEvidenceAutoApprove,
  patchAdminGlobalInvoiceEvidenceAutoApprove,
  patchAdminAllowInvoiceEvidenceAttachment,
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
const {
  adminTikTokLogin,
  adminTikTokCallback,
  adminTikTokStatus,
  adminTikTokDisconnect,
} = require("../controllers/tiktokIntegrationController");
const {
  getLatestPromoDraft,
  generateTodayPromoDraft,
  updatePromoDraft,
  generatePromoOnScreenText,
  generatePromoAudio,
  renderPromoVideo,
  uploadPromoDraftToTikTok,
  downloadPromoAudio,
  downloadPromoVideo,
} = require("../controllers/promoDraftController");

const router = express.Router();

router.use(requireAdminAccess);

router.get("/overview", getAdminOverview);
router.get("/events", listAdminEvents);
router.get("/events/:eventId", getAdminEventDetail);
router.patch("/events/:eventId/disable", disableAdminEvent);
router.patch("/events/:eventId/enable", enableAdminEvent);
router.patch("/events/:eventId/archive", archiveAdminEvent);
router.patch("/events/:eventId/rotate-access-code", rotateAdminEventAccessCode);
router.patch("/events/:eventId/lock-scanner", lockAdminScanner);
router.patch("/events/:eventId/unlock-scanner", unlockAdminScanner);

router.get("/tickets", listAdminTickets);
router.patch("/tickets/:ticketPublicId/invalidate", invalidateAdminTicket);
router.patch("/tickets/:ticketPublicId/restore", restoreAdminTicket);
router.patch("/tickets/:ticketPublicId/reset-usage", resetAdminTicketUsage);

router.get("/scans", listAdminScans);
router.patch("/scans/:scanId/mark-suspicious", markScanSuspicious);
router.get("/organizers", listAdminOrganizers);
router.get("/invoices", listAdminInvoices);

router.get("/settings", getAdminSettings);
router.get("/settings/payment-instructions", getAdminPaymentInstructions);
router.get("/settings/otp-lookup", lookupAdminOtpRecords);
router.patch("/settings/payment-instructions", patchAdminPaymentInstructions);
router.patch("/invoices/:invoiceId/mark-paid", markAdminInvoicePaid);
router.patch("/invoices/:invoiceId/add-payment", addAdminInvoicePayment);
router.patch("/invoices/:invoiceId/retry-delivery", retryAdminInvoiceDelivery);
router.patch("/invoices/:invoiceId/allow-evidence-attachment", patchAdminAllowInvoiceEvidenceAttachment);
router.patch("/invoices/payment-evidence/:evidenceId/approve", approveAdminInvoicePaymentEvidence);
router.post("/invoices/test-evidence-notify", sendAdminEvidenceNotifyTest);
router.post("/perf/create-event-by-code", adminPerfCreateEventByOrganizerCode);
router.patch("/events/:eventId/invoice-evidence-auto-approve", patchAdminInvoiceEvidenceAutoApprove);
router.patch("/events/invoice-evidence-auto-approve-all", patchAdminGlobalInvoiceEvidenceAutoApprove);
router.get("/audit-log", listAdminAuditLog);
router.get("/client-dash-tokens", listAdminClientDashTokens);

// Admin-only TikTok integration (OAuth)
router.get("/tiktok/login", adminTikTokLogin);
router.get("/tiktok/callback", adminTikTokCallback);
router.get("/tiktok/status", adminTikTokStatus);
router.post("/tiktok/disconnect", adminTikTokDisconnect);

// Admin-only TikTok promo drafts (daily)
router.get("/tiktok/promo/latest", getLatestPromoDraft);
router.post("/tiktok/promo/generate-today", generateTodayPromoDraft);
router.patch("/tiktok/promo/:draftId", updatePromoDraft);
router.post("/tiktok/promo/:draftId/generate-onscreen", generatePromoOnScreenText);
router.post("/tiktok/promo/:draftId/generate-audio", generatePromoAudio);
router.get("/tiktok/promo/:draftId/audio", downloadPromoAudio);
router.post("/tiktok/promo/:draftId/render-video", renderPromoVideo);
router.get("/tiktok/promo/:draftId/video", downloadPromoVideo);
router.post("/tiktok/promo/:draftId/upload-draft", uploadPromoDraftToTikTok);

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
