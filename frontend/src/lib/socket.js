import { io } from "socket.io-client";

// In dev the Vite proxy doesn't work for WebSockets on the same port, so connect directly to backend.
// In production the socket server is on the same origin.
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/api$/, "")
  : "http://localhost:4100";

// Singleton socket connection (lazy)
let _socket = null;

export function getSocket() {
  if (!_socket) {
    _socket = io(BACKEND_URL, { autoConnect: true, transports: ["websocket", "polling"] });
  }
  return _socket;
}

/**
 * Join a conversation room.
 * Pass ONE of: accessCode (organizer), clientAccessToken (client), adminKey (admin).
 */
export function joinConversation(conversationId, credentials) {
  const socket = getSocket();
  socket.emit("join_conversation", { conversationId, ...credentials });
}

export function leaveConversation(conversationId) {
  const socket = getSocket();
  socket.emit("leave_conversation", { conversationId });
}

export function onNewMessage(handler) {
  const socket = getSocket();
  socket.on("new_message", handler);
  return () => socket.off("new_message", handler);
}
