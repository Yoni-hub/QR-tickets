const DEFAULT_TICKET_DESIGN = {
  eventName: "QR Tickets Demo Event",
  location: "Sample Venue",
  dateTimeText: "May 15, 2024 | 7:00 PM",
  ticketTypeLabel: "GENERAL ADMISSION",
  priceText: "Free",
  headerImageDataUrl: null,
  headerOverlay: 0.25,
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveTicketDesign(event) {
  const source = event?.designJson && typeof event.designJson === "object" ? event.designJson : {};
  const merged = {
    ...DEFAULT_TICKET_DESIGN,
    ...source,
  };

  if (!source.eventName && event?.eventName) merged.eventName = event.eventName;
  if (!source.location && event?.eventAddress) merged.location = event.eventAddress;
  if (!source.dateTimeText && event?.eventDate) merged.dateTimeText = new Date(event.eventDate).toLocaleString();
  if (!source.ticketTypeLabel && event?.ticketType) merged.ticketTypeLabel = event.ticketType;
  if (!source.priceText && event?.ticketPrice != null) merged.priceText = String(event.ticketPrice);
  return merged;
}

function renderTicketCardHtml({ design, qrDataUrl, ticketPublicId }) {
  const headerBackground = design.headerImageDataUrl
    ? `background-image: url('${design.headerImageDataUrl}'); background-size: cover; background-position: center;`
    : "background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);";

  return `
    <article class="ticket">
      <div class="ticket-header" style="${headerBackground}">
        <div class="ticket-overlay" style="opacity:${Number(design.headerOverlay) || 0.25}"></div>
        <div class="ticket-header-content">
          <h2 class="ticket-event-name">${escapeHtml(design.eventName)}</h2>
          <p class="ticket-event-line">${escapeHtml(design.location)}</p>
          <p class="ticket-event-line">${escapeHtml(design.dateTimeText)}</p>
        </div>
      </div>
      <div class="ticket-body">
        <div class="ticket-meta">
          <p class="ticket-label">Type</p>
          <p class="ticket-value">${escapeHtml(design.ticketTypeLabel)}</p>
          <p class="ticket-label">Price</p>
          <p class="ticket-value">${escapeHtml(design.priceText)}</p>
        </div>
        <div class="ticket-qr-wrap">
          <img class="ticket-qr" src="${qrDataUrl}" alt="QR for ${escapeHtml(ticketPublicId)}" />
          <p class="ticket-id">${escapeHtml(ticketPublicId)}</p>
        </div>
      </div>
    </article>
  `;
}

function renderTicketDocumentHtml({ cardsHtml }) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>QR Tickets PDF</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 16px;
            background: #f8fafc;
            color: #0f172a;
            font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          .ticket-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .ticket {
            border: 1px solid #cbd5e1;
            border-radius: 16px;
            overflow: hidden;
            background: #ffffff;
            width: 100%;
          }
          .ticket-header {
            min-height: 170px;
            position: relative;
            display: flex;
            align-items: flex-end;
          }
          .ticket-overlay {
            position: absolute;
            inset: 0;
            background: #020617;
          }
          .ticket-header-content {
            position: relative;
            z-index: 1;
            color: #ffffff;
            padding: 16px;
          }
          .ticket-event-name {
            margin: 0;
            font-size: 28px;
            line-height: 1.15;
            font-weight: 800;
          }
          .ticket-event-line {
            margin: 6px 0 0;
            font-size: 14px;
            opacity: 0.95;
          }
          .ticket-body {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            padding: 16px;
          }
          .ticket-label {
            margin: 0 0 4px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #64748b;
            font-size: 11px;
            font-weight: 700;
          }
          .ticket-value {
            margin: 0 0 10px;
            font-size: 16px;
            font-weight: 700;
          }
          .ticket-qr-wrap {
            min-width: 148px;
            text-align: center;
          }
          .ticket-qr {
            width: 128px;
            height: 128px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            background: #fff;
            padding: 8px;
          }
          .ticket-id {
            margin: 8px 0 0;
            font-size: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            color: #475569;
          }
          @media (max-width: 560px) {
            .ticket-body { flex-direction: column; }
            .ticket-qr-wrap { text-align: left; }
          }
        </style>
      </head>
      <body>
        <section class="ticket-grid">${cardsHtml}</section>
      </body>
    </html>
  `;
}

module.exports = {
  DEFAULT_TICKET_DESIGN,
  resolveTicketDesign,
  renderTicketCardHtml,
  renderTicketDocumentHtml,
};
