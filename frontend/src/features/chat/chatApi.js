import api from "../../lib/api";
import { adminApi } from "../../lib/adminApi";

function buildMessagePayload({ message, attachment }) {
  const text = String(message || "").trim();
  if (attachment) {
    const formData = new FormData();
    if (text) formData.append("message", text);
    formData.append("attachment", attachment);
    return formData;
  }
  return { message: text };
}

function resolveConfig(payload) {
  return payload instanceof FormData
    ? { headers: { "Content-Type": "multipart/form-data" } }
    : undefined;
}

export const organizerChatApi = {
  listConversations: (accessCode, params = {}) => api.get(`/events/by-code/${encodeURIComponent(accessCode)}/chat/conversations`, { params }),
  startConversation: (accessCode, data) => api.post(`/events/by-code/${encodeURIComponent(accessCode)}/chat/conversations`, data),
  listMessages: (accessCode, conversationId) =>
    api.get(`/events/by-code/${encodeURIComponent(accessCode)}/chat/conversations/${encodeURIComponent(conversationId)}/messages`),
  sendMessage: (accessCode, conversationId, { message, attachment }) => {
    const payload = buildMessagePayload({ message, attachment });
    return api.post(
      `/events/by-code/${encodeURIComponent(accessCode)}/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      payload,
      resolveConfig(payload),
    );
  },
  markRead: (accessCode, conversationId, data = {}) =>
    api.post(`/events/by-code/${encodeURIComponent(accessCode)}/chat/conversations/${encodeURIComponent(conversationId)}/read`, data),
};

export const clientChatApi = {
  listConversations: (clientAccessToken, params = {}) =>
    api.get(`/public/client-dashboard/${encodeURIComponent(clientAccessToken)}/chat/conversations`, { params }),
  startConversation: (clientAccessToken, data) =>
    api.post(`/public/client-dashboard/${encodeURIComponent(clientAccessToken)}/chat/conversations`, data),
  listMessages: (clientAccessToken, conversationId) =>
    api.get(`/public/client-dashboard/${encodeURIComponent(clientAccessToken)}/chat/conversations/${encodeURIComponent(conversationId)}/messages`),
  sendMessage: (clientAccessToken, conversationId, { message, attachment }) => {
    const payload = buildMessagePayload({ message, attachment });
    return api.post(
      `/public/client-dashboard/${encodeURIComponent(clientAccessToken)}/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      payload,
      resolveConfig(payload),
    );
  },
  markRead: (clientAccessToken, conversationId, data = {}) =>
    api.post(`/public/client-dashboard/${encodeURIComponent(clientAccessToken)}/chat/conversations/${encodeURIComponent(conversationId)}/read`, data),
};

export const adminChatApi = {
  listConversations: (params = {}) => adminApi.get("/chat/conversations", { params }),
  startConversation: (data) => adminApi.post("/chat/conversations", data),
  listMessages: (conversationId) => adminApi.get(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`),
  sendMessage: (conversationId, { message, attachment }) => {
    const payload = buildMessagePayload({ message, attachment });
    return adminApi.post(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, payload, resolveConfig(payload));
  },
  markRead: (conversationId, data = {}) => adminApi.post(`/chat/conversations/${encodeURIComponent(conversationId)}/read`, data),
  setStatus: (conversationId, status) => adminApi.patch(`/chat/conversations/${encodeURIComponent(conversationId)}/status`, { status }),
};
