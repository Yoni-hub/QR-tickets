function sendTicketSms({ to, eventName, ticketUrl }) {
  const provider = String(process.env.SMS_PROVIDER || "").trim().toLowerCase();

  if (!to) return Promise.resolve({ skipped: true, reason: "missing-phone" });

  // Placeholder for future provider integration.
  // Phase 1 keeps delivery optional and non-blocking.
  if (!provider) {
    console.log(`[sms:stub] to=${to} event=${eventName} url=${ticketUrl}`);
    return Promise.resolve({ skipped: true, reason: "provider-not-configured" });
  }

  console.log(`[sms:${provider}] to=${to} event=${eventName} url=${ticketUrl}`);
  return Promise.resolve({ sent: true, provider });
}

module.exports = { sendTicketSms };