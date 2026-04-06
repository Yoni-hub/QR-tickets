const Sentry = require("@sentry/node");
const logger = require("./logger");

const SENSITIVE_KEY_PATTERN = /(otp|password|pass|token|secret|authorization|cookie|accesscode|admin.?key|api.?key|session)/i;
const SENSITIVE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
const SAFE_HEADER_ALLOWLIST = new Set(["host", "user-agent", "content-type", "content-length", "accept"]);

let sentryEnabled = false;

function redactIfSensitiveKey(key, value) {
  return SENSITIVE_KEY_PATTERN.test(String(key || "")) ? "[REDACTED]" : value;
}

function sanitizeQueryString(queryString) {
  if (!queryString) return undefined;
  try {
    const params = new URLSearchParams(String(queryString));
    for (const key of params.keys()) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        params.set(key, "[REDACTED]");
      }
    }
    return params.toString();
  } catch {
    return undefined;
  }
}

function sanitizePathname(pathname) {
  const parts = String(pathname || "")
    .split("/")
    .map((segment) => segment.trim());

  const redacted = parts.map((segment, idx, arr) => {
    if (!segment) return segment;
    const prev = String(arr[idx - 1] || "").toLowerCase();
    if (prev === "by-code" || prev === "client-dashboard" || prev === "conversations") {
      return "[REDACTED]";
    }
    if (SENSITIVE_SEGMENT_PATTERN.test(segment)) {
      return "[REDACTED]";
    }
    return segment;
  });

  return redacted.join("/");
}

function sanitizeUrl(urlValue) {
  const raw = String(urlValue || "");
  if (!raw) return raw;

  try {
    const parsed = new URL(raw, "http://localhost");
    parsed.search = "";
    parsed.pathname = sanitizePathname(parsed.pathname);
    if (/^https?:\/\//i.test(raw)) {
      return parsed.toString();
    }
    return parsed.pathname;
  } catch {
    const [pathOnly] = raw.split("?");
    return sanitizePathname(pathOnly);
  }
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return undefined;
  const sanitized = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = String(rawKey || "").toLowerCase();
    if (!SAFE_HEADER_ALLOWLIST.has(key)) continue;
    sanitized[key] = redactIfSensitiveKey(key, rawValue);
  }
  return sanitized;
}

function scrubSentryEvent(event) {
  const nextEvent = { ...event };
  const req = { ...(nextEvent.request || {}) };

  delete req.data;
  delete req.cookies;

  if (req.query_string) {
    req.query_string = sanitizeQueryString(req.query_string);
  }
  if (req.url) {
    req.url = sanitizeUrl(req.url);
  }
  if (req.headers) {
    req.headers = sanitizeHeaders(req.headers);
  }

  nextEvent.request = req;
  return nextEvent;
}

function initSentry() {
  const dsn = String(process.env.SENTRY_DSN || "").trim();
  if (!dsn) {
    sentryEnabled = false;
    return false;
  }

  try {
    const env = String(process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development").trim();
    const release = String(process.env.SENTRY_RELEASE || "").trim() || undefined;
    const tracesSampleRateRaw = String(process.env.SENTRY_TRACES_SAMPLE_RATE || "0").trim();
    const tracesSampleRate = Number.parseFloat(tracesSampleRateRaw);

    Sentry.init({
      dsn,
      environment: env,
      release,
      sendDefaultPii: false,
      tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
      beforeSend: scrubSentryEvent,
      initialScope: {
        tags: {
          service: "qr-tickets-backend",
        },
      },
    });

    sentryEnabled = true;
    logger.info("Sentry error tracking enabled");
    return true;
  } catch (error) {
    sentryEnabled = false;
    logger.error("Sentry initialization failed", error);
    return false;
  }
}

function sentryRequestContext(req, _res, next) {
  if (!sentryEnabled) {
    next();
    return;
  }

  const requestId = String(req.headers?.["x-request-id"] || "").trim();
  if (requestId) {
    Sentry.setTag("request_id", requestId.slice(0, 128));
  }

  if (req.path.startsWith("/api/admin")) {
    Sentry.setTag("api_surface", "admin");
  } else if (req.path.startsWith("/api/public")) {
    Sentry.setTag("api_surface", "public");
  } else if (req.path.startsWith("/api")) {
    Sentry.setTag("api_surface", "api");
  } else {
    Sentry.setTag("api_surface", "other");
  }

  next();
}

function attachSentryErrorHandler(app) {
  if (!sentryEnabled) return false;
  Sentry.setupExpressErrorHandler(app);
  return true;
}

function isSentryEnabled() {
  return sentryEnabled;
}

module.exports = {
  initSentry,
  sentryRequestContext,
  attachSentryErrorHandler,
  isSentryEnabled,
};
