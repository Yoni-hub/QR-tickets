const nodemailer = require("nodemailer");

let cachedTransporter;

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

async function sendTicketLinkEmail({ to, eventName, eventDate, eventAddress, ticketType, ticketUrl }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || "no-reply@localhost";
  const subject = `Your ticket for ${eventName}`;
  const text = [
    `Event: ${eventName}`,
    `When: ${new Date(eventDate).toLocaleString()}`,
    `Where: ${eventAddress}`,
    `Ticket: ${ticketType || "General"}`,
    `Link: ${ticketUrl}`,
  ].join("\n\n");

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
  });
}

module.exports = {
  sendTicketLinkEmail,
};

