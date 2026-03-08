import api from "./api";

const ADMIN_KEY_STORAGE = "qr_tickets_admin_key";

export function getAdminKey() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(ADMIN_KEY_STORAGE) || "").trim();
}

export function setAdminKey(value) {
  if (typeof window === "undefined") return;
  const normalized = String(value || "").trim();
  if (!normalized) {
    window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    return;
  }
  window.localStorage.setItem(ADMIN_KEY_STORAGE, normalized);
}

export function clearAdminKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_KEY_STORAGE);
}

async function request(method, url, data, config = {}) {
  const key = getAdminKey();
  if (!key) {
    const error = new Error("Admin key missing.");
    error.code = "ADMIN_KEY_MISSING";
    throw error;
  }

  return api.request({
    method,
    url,
    data,
    ...config,
    headers: {
      ...(config.headers || {}),
      "x-admin-key": key,
    },
  });
}

export const adminApi = {
  get: (url, config) => request("get", `/admin${url}`, undefined, config),
  post: (url, data, config) => request("post", `/admin${url}`, data, config),
  patch: (url, data, config) => request("patch", `/admin${url}`, data, config),
};