const express = require("express");
const {
  createLiveEvent,
  createDemoEvent,
  getEventByCode,
  getEventTickets,
  getTicketsPdf,
} = require("../controllers/eventController");
const { scanTicket } = require("../controllers/scanController");
const { getTicketByPublicId, getPublicTicketByPublicId } = require("../controllers/ticketController");
const { sendOrderTicketLinks } = require("../controllers/orderController");

const router = express.Router();

router.post("/events", createLiveEvent);
router.post("/demo/events", createDemoEvent);
router.get("/events/by-code/:accessCode", getEventByCode);
router.get("/events/:eventId/tickets", getEventTickets);
router.get("/events/:eventId/tickets.pdf", getTicketsPdf);
router.get("/tickets/:ticketPublicId", getTicketByPublicId);
router.get("/tickets/public/:ticketPublicId", getPublicTicketByPublicId);
router.post("/orders/:accessCode/send-links", sendOrderTicketLinks);
router.post("/scans", scanTicket);

module.exports = router;
