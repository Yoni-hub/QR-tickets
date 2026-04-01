const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const morgan = require("morgan");
const apiRoutes = require("./routes/apiRoutes");
const socketManager = require("./socket/socketManager");
const { registerSocketHandlers } = require("./socket/socketHandler");

dotenv.config();

const app = express();
app.set("trust proxy", 1);
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
app.use(morgan("combined"));
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "12mb" }));

// Rate limiters — only on truly open/unauthenticated endpoints
const scanLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many scan requests, please try again later." },
});

// 5 OTP sends per IP per hour — prevents email bombing
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification requests. Try again later." },
});

// 10 support conversations per IP per hour
const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

// Failed scan tracker — blocks IPs that repeatedly send invalid ticket IDs
const failedScanCounts = new Map();
const FAILED_SCAN_THRESHOLD = 20;
const FAILED_SCAN_BLOCK_DURATION = 15 * 60 * 1000;

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

app.use("/api/scans", scanLimiter, failedScanGuard);
app.use("/api/public/send-otp", otpLimiter);
app.use("/api/public/verify-otp", otpLimiter);
app.use("/api/public/recover-client-token", otpLimiter);
app.use("/api/public/support/conversations", supportLimiter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// OG preview for social crawlers — nginx routes bot User-Agents here for /e/:slug
app.get("/e/:slug", async (req, res) => {
  const prisma = require("./utils/prisma");
  const slug = String(req.params.slug || "").trim();
  const base = process.env.PUBLIC_BASE_URL || "https://qr-tickets.connsura.com";
  try {
    const event = await prisma.userEvent.findFirst({
      where: { slug, adminStatus: "ACTIVE" },
      select: { eventName: true, eventDate: true, eventAddress: true, organizerName: true },
    });
    const title = event ? `${event.eventName} — Get Your Ticket` : "Event Tickets · Connsura";
    const description = event
      ? `Tickets for ${event.eventName}${event.eventAddress ? ` at ${event.eventAddress}` : ""}. Get yours now on Connsura.`
      : "Get your event tickets now on Connsura.";
    const url = `${base}/e/${slug}`;
    const image = `${base}/new_OG.png`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
</head>
<body></body>
</html>`);
  } catch {
    res.redirect(302, `${base}/e/${slug}`);
  }
});

app.use("/api", apiRoutes);

server.listen(PORT, () => {
  console.log(`QR Tickets backend running on port ${PORT}`);
});
