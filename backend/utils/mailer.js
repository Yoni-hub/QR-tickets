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

module.exports = {
  sendTicketApprovedEmail,
  sendTicketCancelledEmail,
  sendNewChatMessageEmail,
  sendOrganizerNewRequestEmail,
  sendOrganizerNewMessageEmail,
};
