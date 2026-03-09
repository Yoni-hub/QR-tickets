const nodemailer = require("nodemailer");

let cachedTransporter;

const DEFAULT_SUBJECT_TEMPLATE = "Your ticket for {{eventName}}";
const DEFAULT_BODY_TEMPLATE = [
  "Hello,",
  "",
  "Your {{ticketType}} ticket for {{eventName}} is ready.",
  "",
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

function renderEmailHtml(textBody, ticketUrl) {
  const buttonToken = "__VIEW_TICKET_BUTTON__";
  const safeText = escapeHtml(textBody).replaceAll("[ View Your Ticket ]", buttonToken);
  const safeTicketUrl = escapeHtml(ticketUrl);
  const buttonHtml = `<div style="text-align:center;margin:14px 0;"><a href="${safeTicketUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">View Your Ticket</a></div>`;
  const content = safeText.replaceAll("\n", "<br />").replaceAll(buttonToken, buttonHtml);
  return `<div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">${content}</div>`;
}

function buildTicketLinkEmailContent({
  to,
  eventName,
  eventDate,
  eventAddress,
  ticketType,
  ticketUrl,
  subjectTemplate,
  bodyTemplate,
}) {
  const templateValues = {
    to,
    eventName,
    eventDate,
    eventAddress,
    ticketType,
    ticketUrl,
  };
  const resolvedBodyTemplate = bodyTemplate || DEFAULT_BODY_TEMPLATE;
  const resolvedText = renderEmailTemplate(resolvedBodyTemplate, templateValues);
  const useDefaultHtmlTemplate = resolvedBodyTemplate === DEFAULT_BODY_TEMPLATE;

  return {
    subject: renderEmailTemplate(subjectTemplate || DEFAULT_SUBJECT_TEMPLATE, templateValues),
    text: resolvedText,
    html: useDefaultHtmlTemplate
      ? renderEmailTemplate(DEFAULT_HTML_TEMPLATE, templateValues)
      : renderEmailHtml(resolvedText, ticketUrl),
  };
}

async function sendTicketLinkEmail({
  to,
  eventName,
  eventDate,
  eventAddress,
  ticketType,
  ticketUrl,
  subjectTemplate,
  bodyTemplate,
}) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const content = buildTicketLinkEmailContent({
    to,
    eventName,
    eventDate,
    eventAddress,
    ticketType,
    ticketUrl,
    subjectTemplate,
    bodyTemplate,
  });

  return transporter.sendMail({
    from,
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}

async function sendTicketLinksDigestEmail({
  to,
  eventName,
  eventDate,
  eventAddress,
  ticketLinks,
}) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const safeLinks = Array.isArray(ticketLinks) ? ticketLinks : [];
  const formattedDate = new Date(eventDate).toLocaleString();
  const lines = safeLinks.map((item) => `${String(item.ticketType || "General")}: ${String(item.ticketUrl || "")}`);
  const subject = `Your tickets for ${String(eventName || "your event")} are ready`;
  const text = [
    "Hello,",
    "",
    `Your tickets for ${String(eventName || "")} are ready.`,
    "",
    `Event: ${String(eventName || "")}`,
    `Date: ${formattedDate}`,
    `Location: ${String(eventAddress || "")}`,
    "",
    "Use the links below to view your tickets:",
    ...lines,
    "",
    `The tickets were sent to ${String(to || "")}.`,
    "Please present the QR codes at the entrance.",
  ].join("\n");
  const htmlLines = lines
    .map((line) => {
      const [type, ...rest] = line.split(": ");
      const url = rest.join(": ");
      const safeType = escapeHtml(type);
      const safeUrl = escapeHtml(url);
      return `<li style="margin:6px 0;"><strong>${safeType}</strong>: <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a></li>`;
    })
    .join("");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a;">
      <p>Hello,</p>
      <p>Your tickets for <strong>${escapeHtml(eventName)}</strong> are ready.</p>
      <p><strong>Event:</strong> ${escapeHtml(eventName)}<br />
      <strong>Date:</strong> ${escapeHtml(formattedDate)}<br />
      <strong>Location:</strong> ${escapeHtml(eventAddress)}</p>
      <p>Use the links below to view your tickets:</p>
      <ul style="padding-left:18px;margin:8px 0 16px 0;">${htmlLines}</ul>
      <p>The tickets were sent to <strong>${escapeHtml(to)}</strong>.<br />Please present the QR codes at the entrance.</p>
    </div>
  `;

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendTicketLinkEmail,
  sendTicketLinksDigestEmail,
  DEFAULT_SUBJECT_TEMPLATE,
  DEFAULT_BODY_TEMPLATE,
  renderEmailTemplate,
};
