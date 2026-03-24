const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const apiRoutes = require("./routes/apiRoutes");
const socketManager = require("./socket/socketManager");
const { registerSocketHandlers } = require("./socket/socketHandler");

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4100;

const ALLOWED_ORIGIN = process.env.PUBLIC_BASE_URL || "http://localhost:5174";

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
  },
});

socketManager.init(io);
registerSocketHandlers(io);

app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "12mb" }));

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many scan requests, please try again later." },
});

// 3 event creations per IP per hour
const eventCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many events created from this device. Try again later." },
});

// 5 ticket generation requests per IP per hour
const ticketGenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many ticket generation requests from this device. Try again later." },
});

// Failed scan tracker — blocks IPs that repeatedly send invalid scans
const failedScanCounts = new Map(); // ip -> { count, blockedUntil }
const FAILED_SCAN_THRESHOLD = 20;        // consecutive INVALID_TICKET before block
const FAILED_SCAN_BLOCK_DURATION = 15 * 60 * 1000; // 15 min block

function failedScanGuard(req, res, next) {
  const ip = req.ip;
  const entry = failedScanCounts.get(ip);
  if (entry?.blockedUntil && Date.now() < entry.blockedUntil) {
    res.status(429).json({ error: "Too many invalid scan attempts. Try again later." });
    return;
  }
  next();
}

app.failedScanCounts = failedScanCounts;
app.FAILED_SCAN_THRESHOLD = FAILED_SCAN_THRESHOLD;
app.FAILED_SCAN_BLOCK_DURATION = FAILED_SCAN_BLOCK_DURATION;

app.use("/api", generalLimiter);
app.use("/api/scans", scanLimiter, failedScanGuard);
app.use("/api/public/ticket-request", strictLimiter);
app.use("/api/public/support/conversations", strictLimiter);
app.use("/api/events", eventCreationLimiter);
app.use("/api/demo/events", eventCreationLimiter);
app.use("/api/events/by-code", ticketGenLimiter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", apiRoutes);

server.listen(PORT, () => {
  console.log(`QR Tickets backend running on port ${PORT}`);
});
