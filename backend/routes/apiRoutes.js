const express = require("express");
const {
  createLiveEvent,
  createDemoEvent,
  getEventByCode,
  getEventTickets,
} = require("../controllers/eventController");
const { scanTicket } = require("../controllers/scanController");

const router = express.Router();

router.post("/events", createLiveEvent);
router.post("/demo/events", createDemoEvent);
router.get("/events/by-code/:accessCode", getEventByCode);
router.get("/events/:eventId/tickets", getEventTickets);
router.post("/scans", scanTicket);

module.exports = router;
