const { resolveOrganizerScope } = require("../services/chatService");
const prisma = require("../utils/prisma");

const ADMIN_KEY = process.env.ADMIN_PANEL_KEY || "";

async function authenticateJoin(actor, conversationId) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: {
      partyAType: true,
      partyAOrganizerAccessCode: true,
      partyAClientAccessToken: true,
      partyBType: true,
      partyBOrganizerAccessCode: true,
      partyBClientAccessToken: true,
    },
  });
  if (!conversation) return false;

  if (actor.type === "ADMIN") return true;

  const matchesParty = (prefix) => {
    const type = conversation[`${prefix}Type`];
    if (type !== actor.type) return false;
    if (type === "ORGANIZER") {
      return conversation[`${prefix}OrganizerAccessCode`] === actor.organizerAccessCode;
    }
    if (type === "CLIENT") {
      return conversation[`${prefix}ClientAccessToken`] === actor.clientAccessToken;
    }
    return false;
  };

  return matchesParty("partyA") || matchesParty("partyB");
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("join_conversation", async ({ conversationId, accessCode, clientAccessToken, adminKey }) => {
      try {
        let actor = null;

        if (adminKey && adminKey === ADMIN_KEY) {
          actor = { type: "ADMIN" };
        } else if (accessCode) {
          const scope = await resolveOrganizerScope(accessCode);
          if (scope) actor = { type: "ORGANIZER", organizerAccessCode: scope.organizerAccessCode };
        } else if (clientAccessToken) {
          actor = { type: "CLIENT", clientAccessToken: String(clientAccessToken).trim() };
        }

        if (!actor || !conversationId) {
          socket.emit("error", { message: "Authentication failed." });
          return;
        }

        const allowed = await authenticateJoin(actor, conversationId);
        if (!allowed) {
          socket.emit("error", { message: "Access denied." });
          return;
        }

        const room = `conv:${conversationId}`;
        socket.join(room);
        socket.emit("joined", { conversationId });
      } catch (err) {
        console.error("[socket] join_conversation error:", err);
        socket.emit("error", { message: "Internal error." });
      }
    });

    socket.on("leave_conversation", ({ conversationId }) => {
      if (conversationId) socket.leave(`conv:${conversationId}`);
    });
  });
}

module.exports = { registerSocketHandlers };
