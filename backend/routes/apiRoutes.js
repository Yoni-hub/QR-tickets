const express = require("express");
const {
  createLiveEvent,
  createDemoEvent,
  getEventByCode,
  getEventTickets,
  getTicketsPdf,
} = require("../controllers/eventController");
const { scanTicket } = require("../controllers/scanController");
const { getTicketByPublicId } = require("../controllers/ticketController");

const router = express.Router();

router.post("/events", createLiveEvent);
router.post("/demo/events", createDemoEvent);
router.get("/events/by-code/:accessCode", getEventByCode);
router.get("/events/:eventId/tickets", getEventTickets);
router.get("/events/:eventId/tickets.pdf", getTicketsPdf);
router.get("/tickets/:ticketPublicId", getTicketByPublicId);
router.post("/scans", scanTicket);

module.exports = router;
