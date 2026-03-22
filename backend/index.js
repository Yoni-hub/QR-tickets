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
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

app.use("/api", generalLimiter);
app.use("/api/scans", strictLimiter);
app.use("/api/public/ticket-request", strictLimiter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", apiRoutes);

server.listen(PORT, () => {
  console.log(`QR Tickets backend running on port ${PORT}`);
});
