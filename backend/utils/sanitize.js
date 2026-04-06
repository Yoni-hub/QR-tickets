/**
 * Input sanitization and length-limit helpers.
 * Used across controllers to strip HTML and enforce max lengths before DB writes.
 */

const LIMITS = {
  NAME: 150,
  EVENT_NAME: 200,
  EVENT_ADDRESS: 300,
  PAYMENT_INSTRUCTIONS: 2000,
  TICKET_TYPE: 100,
  CANCELLATION_REASON: 500,
  SUBJECT: 200,
  EMAIL: 254,
  MESSAGE: 1200,
  SCAN_VALUE: 300,
  SCANNER_SOURCE: 100,
};

/**
 * Trim, strip HTML tags, and truncate to maxLen.
 * Returns empty string for null/undefined.
 */
function sanitizeText(str, maxLen) {
  const s = String(str ?? "")
    .trim()
    .replace(/<[^>]*>/g, "");
  return maxLen ? s.slice(0, maxLen) : s;
}

/**
 * For catch blocks: only forward error.message to the client when the error
 * is an intentional app error (has a statusCode < 500). Otherwise return fallback
 * so internal DB/runtime details are never exposed.
 */
function safeError(error, fallback) {
  if (error?.statusCode && error.statusCode < 500) return error.message || fallback;
  require("./logger").error(error);
  return fallback;
}

module.exports = { LIMITS, sanitizeText, safeError };
