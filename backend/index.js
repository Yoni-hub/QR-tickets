const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const { Server } = require("socket.io");
const apiRoutes = require("./routes/apiRoutes");
const socketManager = require("./socket/socketManager");
const { registerSocketHandlers } = require("./socket/socketHandler");

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4100;

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

socketManager.init(io);
registerSocketHandlers(io);

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api", apiRoutes);

server.listen(PORT, () => {
  console.log(`QR Tickets backend running on port ${PORT}`);
});
