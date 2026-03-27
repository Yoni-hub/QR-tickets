const nodemailer = require("nodemailer");

let cachedTransporter;

const DEFAULT_SUBJECT_TEMPLATE = "Your ticket for {{eventName}}";
const DEFAULT_BODY_TEMPLATE = [
  "Hello,",
  "",
  "Your {{ticketType}} ticket for {{eventName}} is ready.",
  "",
  "Organizer: {{organizerName}}",
  "Event: {{eventName}}",
  "Date: {{eventDate}}",
  "Location: {{eventAddress}}",
  "",
  "Click the button below to view your ticket.",
  "",
  "If the button does not work, use this link:",
  "{{ticketUrl}}",
  "",
  "This ticket was sent to {{recipientEmail}}.",
  "Please present the QR code at the entrance.",
].join("\n");
const DEFAULT_HTML_TEMPLATE = `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;padding:16px 0;">
  <tr>
    <td align="center">
      <table width="520" cellpadding="24" cellspacing="0" role="presentation" style="background:#f5f7fb;border-radius:8px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <tr>
          <td align="center">
            <p style="margin:0 0 18px 0;font-size:20px;font-weight:700;">
              Ticket Confirmed
            </p>

            <p style="margin:0 0 16px 0;">
              Hello,
            </p>

            <p style="margin:0 0 20px 0;">
              Your <strong>{{ticketType}}</strong> ticket for <strong>{{eventName}}</strong> is ready.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;text-align:left;">
              <tr>
                <td style="padding:4px 10px 4px 0;">Organizer:</td>
                <td><strong>{{organizerName}}</strong></td>
              </tr>
              <tr>
                <td style="padding:4px 10px 4px 0;">Event:</td>
                <td><strong>{{eventName}}</strong></td>
              </tr>
              <tr>
                <td style="padding:4px 10px 4px 0;">Date:</td>
                <td><strong>{{eventDate}}</strong></td>
              </tr>
              <tr>
                <td style="padding:4px 10px 4px 0;">Location:</td>
                <td><strong>{{eventAddress}}</strong></td>
              </tr>
            </table>

            <p style="margin:20px 0;text-align:center;">
              Tap below to view your ticket for <strong>{{eventName}}</strong>.
            </p>

            <p style="text-align:center;margin:20px 0;">
              <a href="{{ticketUrl}}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
                View Your Ticket
              </a>
            </p>

            <p style="margin:20px 0;">
              If the button does not work, use this link:
            </p>

            <p style="margin:0 0 20px 0;word-break:break-all;">
              <a href="{{ticketUrl}}" target="_blank" rel="noopener noreferrer" style="color:#2d5bd1;">{{ticketUrl}}</a>
            </p>

            <p style="margin:0 0 10px 0;">
              This ticket was sent to <strong>{{recipientEmail}}</strong>.
            </p>

            <p style="margin:0;">
              Please present the QR code at the entrance.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({ jsonTransport: true });
  return cachedTransporter;
}

function renderEmailTemplate(template, values) {
  const replacements = {
    "{{organizerName}}": String(values.organizerName || ""),
    "{{eventName}}": String(values.eventName || ""),
    "{{eventDate}}": new Date(values.eventDate).toLocaleString(),
    "{{eventAddress}}": String(values.eventAddress || ""),
    "{{ticketType}}": String(values.ticketType || "General"),
    "{{ticketUrl}}": String(values.ticketUrl || ""),
    "{{recipientEmail}}": String(values.to || ""),
  };

  return Object.entries(replacements).reduce(
    (acc, [token, tokenValue]) => acc.split(token).join(tokenValue),
    String(template || ""),
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendTicketApprovedEmail({ to, eventName, eventDate, eventAddress, dashboardUrl }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const formattedDate = eventDate ? new Date(eventDate).toLocaleString() : "";
  const subject = `Your ticket for ${String(eventName || "your event")} is ready`;
  const text = [
    "Hello,",
    "",
    `Your ticket request for ${String(eventName || "")} has been approved!`,
    "",
    `Event: ${String(eventName || "")}`,
    formattedDate ? `Date: ${formattedDate}` : "",
    eventAddress ? `Location: ${String(eventAddress)}` : "",
    "",
    "Go to your client dashboard to view your ticket:",
    String(dashboardUrl || ""),
    "",
    "Please present the QR code at the entrance.",
  ].filter((line) => line !== undefined).join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>Your ticket request for <strong>${escapeHtml(eventName)}</strong> has been <strong style="color:#16a34a;">approved</strong>!</p>
      ${formattedDate || eventAddress ? `<p><strong>Event:</strong> ${escapeHtml(eventName)}<br />${formattedDate ? `<strong>Date:</strong> ${escapeHtml(formattedDate)}<br />` : ""}${eventAddress ? `<strong>Location:</strong> ${escapeHtml(String(eventAddress))}` : ""}</p>` : ""}
      <p>Go to your client dashboard to view your ticket:</p>
      <p style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(String(dashboardUrl || ""))}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">View My Ticket</a>
      </p>
      <p>Please present the QR code at the entrance.</p>
    </div>
  `;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendTicketCancelledEmail({ to, eventName, dashboardUrl }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = `Your ticket for ${String(eventName || "your event")} has been cancelled`;
  const text = [
    "Hello,",
    "",
    `Your ticket for ${String(eventName || "")} has been cancelled by the organizer.`,
    "",
    "You can visit your client dashboard for more details:",
    String(dashboardUrl || ""),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>Your ticket for <strong>${escapeHtml(eventName)}</strong> has been <strong style="color:#dc2626;">cancelled</strong> by the organizer.</p>
      <p>You can visit your client dashboard for more details:</p>
      <p style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(String(dashboardUrl || ""))}" target="_blank" rel="noopener noreferrer" style="background:#64748b;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">View Dashboard</a>
      </p>
    </div>
  `;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendNewChatMessageEmail({ to, eventName, dashboardUrl }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = `New message about your ticket for ${String(eventName || "your event")}`;
  const text = [
    "Hello,",
    "",
    `You have a new message from the organizer about your ticket for ${String(eventName || "")}.`,
    "",
    "Visit your client dashboard to read and reply:",
    String(dashboardUrl || ""),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>You have a new message from the organizer about your ticket for <strong>${escapeHtml(eventName)}</strong>.</p>
      <p>Visit your client dashboard to read and reply:</p>
      <p style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(String(dashboardUrl || ""))}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Go to Dashboard</a>
      </p>
    </div>
  `;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendOrganizerNewRequestEmail({ to, eventName, requestId, dashboardUrl }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = `New ticket request for ${String(eventName || "your event")}`;
  const text = [
    "Hello,",
    "",
    `A new ticket request has been submitted for ${String(eventName || "")}. Log in to your organizer dashboard to review and approve it.`,
    "",
    String(dashboardUrl || ""),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>A new ticket request has been submitted for <strong>${escapeHtml(eventName)}</strong>.</p>
      <p>Log in to your organizer dashboard to review and approve it:</p>
      <p style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(String(dashboardUrl || ""))}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Review Request</a>
      </p>
    </div>
  `;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendOrganizerNewMessageEmail({ to, eventName, senderName, dashboardUrl }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = `New message about ${String(eventName || "your event")}`;
  const text = [
    "Hello,",
    "",
    `${String(senderName || "A customer")} has sent you a message about ${String(eventName || "your event")}.`,
    "",
    "Log in to your organizer dashboard to reply:",
    String(dashboardUrl || ""),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p><strong>${escapeHtml(String(senderName || "A customer"))}</strong> has sent you a message about <strong>${escapeHtml(eventName)}</strong>.</p>
      <p>Log in to your organizer dashboard to reply:</p>
      <p style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(String(dashboardUrl || ""))}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">View Message</a>
      </p>
    </div>
  `;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendOtpEmail({ to, code, eventName }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = `Your verification code${eventName ? ` for ${String(eventName)}` : ""}`;
  const text = [
    "Hello,",
    "",
    `Your verification code is: ${code}`,
    "",
    "This code expires in 10 minutes.",
    "Do not share this code with anyone.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>Your verification code${eventName ? ` for <strong>${escapeHtml(eventName)}</strong>` : ""} is:</p>
      <p style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:16px 32px;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#1e293b;">${escapeHtml(code)}</span>
      </p>
      <p style="color:#64748b;font-size:13px;">This code expires in 10 minutes. Do not share it with anyone.</p>
    </div>
  `;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendClientRecoveryEmail({ to, dashboardLinks }) {
  // dashboardLinks: [{ eventName, dashboardUrl, requestDate }]
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = "Your QR Tickets dashboard links";

  const textBlocks = dashboardLinks.map((item) =>
    `Event: ${item.eventName}\nRequested: ${item.requestDate}\nDashboard: ${item.dashboardUrl}`,
  ).join("\n\n");

  const text = [
    "Hello,",
    "",
    "Here are your QR Tickets dashboard links:",
    "",
    textBlocks,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const htmlLinks = dashboardLinks.map((item) => `
    <div style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 4px 0;font-weight:700;">${escapeHtml(item.eventName)}</p>
      <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;">Requested: ${escapeHtml(item.requestDate)}</p>
      <a href="${escapeHtml(item.dashboardUrl)}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block;">Open My Dashboard</a>
    </div>
  `).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>Here are your QR Tickets dashboard links:</p>
      ${htmlLinks}
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">If you did not request this recovery, you can ignore this email.</p>
    </div>
  `;

  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendOrganizerRecoveryEmail({ to, entries }) {
  // entries: [{ organizerAccessCode, eventNames }]
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = "Your QR Tickets organizer access code";

  const textBlocks = entries.map((e) =>
    `Access code: ${e.organizerAccessCode}\nEvents: ${e.eventNames.join(", ")}`,
  ).join("\n\n");

  const text = [
    "Hello,",
    "",
    "Here is your QR Tickets organizer access code:",
    "",
    textBlocks,
    "",
    "Use this code to log into your organizer dashboard.",
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const htmlBlocks = entries.map((e) => `
    <div style="margin-bottom:16px;padding:16px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 6px 0;font-size:12px;color:#64748b;">Events: ${escapeHtml(e.eventNames.join(", "))}</p>
      <p style="margin:0 0 10px 0;font-size:13px;color:#374151;">Your organizer access code:</p>
      <code style="display:block;font-size:18px;font-weight:700;letter-spacing:0.05em;color:#0f172a;background:#ffffff;border:1px solid #cbd5e1;border-radius:4px;padding:10px 14px;">${escapeHtml(e.organizerAccessCode)}</code>
    </div>
  `).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>Here is your QR Tickets organizer access code:</p>
      ${htmlBlocks}
      <p>Use this code to log into your <a href="${escapeHtml(process.env.PUBLIC_BASE_URL || "")}/dashboard" style="color:#2d5bd1;">organizer dashboard</a>.</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">If you did not request this recovery, you can ignore this email.</p>
    </div>
  `;

  return transporter.sendMail({ from, to, subject, text, html });
}

module.exports = {
  sendTicketApprovedEmail,
  sendTicketCancelledEmail,
  sendNewChatMessageEmail,
  sendOrganizerNewRequestEmail,
  sendOrganizerNewMessageEmail,
  sendOtpEmail,
  sendClientRecoveryEmail,
  sendOrganizerRecoveryEmail,
};
