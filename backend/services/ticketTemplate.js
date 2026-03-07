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

function renderTicketDocumentHtml({ pagesHtml, ticketsPerPage = 2 }) {
  const safeTicketsPerPage = Math.min(4, Math.max(1, Number.parseInt(ticketsPerPage, 10) || 2));
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>QR Tickets PDF</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #0f172a;
            font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          .ticket-page {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            padding: 12mm 10mm;
            overflow: hidden;
          }
          .ticket-page:last-child {
            page-break-after: auto;
          }
          .ticket-grid {
            display: grid;
            grid-template-columns: 1fr;
            justify-items: center;
            align-content: center;
            row-gap: var(--slot-gap, 0mm);
            height: 100%;
          }
          .ticket-slot {
            width: var(--ticket-width);
            height: calc(var(--ticket-width) / var(--ticket-aspect));
            min-height: 0;
            overflow: visible;
          }

          /* 1-up fixed layout */
          .ticket-page.mode-1 {
            --ticket-aspect: 1.82;
            --ticket-width: 186mm;
            --slot-gap: 0mm;
            --header-height: 40mm;
            --body-padding: 5.2mm;
            --body-gap: 4.8mm;
            --event-name-size: 10.2mm;
            --event-line-size: 3.7mm;
            --label-size: 3.1mm;
            --value-size: 5mm;
            --qr-size: 27mm;
            --qr-padding: 1.8mm;
            --id-size: 2.9mm;
          }

          /* 2-up fixed layout */
          .ticket-page.mode-2 {
            --ticket-aspect: 1.82;
            --ticket-width: 186mm;
            --slot-gap: 10mm;
            --header-height: 40mm;
            --body-padding: 5.2mm;
            --body-gap: 4.8mm;
            --event-name-size: 10mm;
            --event-line-size: 3.7mm;
            --label-size: 3.1mm;
            --value-size: 5mm;
            --qr-size: 27mm;
            --qr-padding: 1.8mm;
            --id-size: 2.9mm;
          }

          /* 3-up fixed layout */
          .ticket-page.mode-3 {
            --ticket-aspect: 1.82;
            --ticket-width: 155mm;
            --slot-gap: 8mm;
            --header-height: 30mm;
            --body-padding: 4mm;
            --body-gap: 3.4mm;
            --event-name-size: 6.6mm;
            --event-line-size: 3mm;
            --label-size: 2.5mm;
            --value-size: 3.9mm;
            --qr-size: 20mm;
            --qr-padding: 1.2mm;
            --id-size: 2.3mm;
          }

          /* 4-up fixed layout */
          .ticket-page.mode-4 {
            --ticket-aspect: 1.82;
            --ticket-width: 113mm;
            --slot-gap: 6mm;
            --header-height: 21mm;
            --body-padding: 3mm;
            --body-gap: 2.6mm;
            --event-name-size: 5.2mm;
            --event-line-size: 2.5mm;
            --label-size: 2.1mm;
            --value-size: 3.2mm;
            --qr-size: 16mm;
            --qr-padding: 1mm;
            --id-size: 2mm;
          }

          .ticket {
            border: 0.45mm solid #94a3b8;
            border-radius: 4mm;
            overflow: hidden;
            background: #ffffff;
            width: 100%;
            height: 100%;
            min-height: 0;
            display: grid;
            grid-template-rows: var(--header-height) 1fr;
            box-sizing: border-box;
          }
          .ticket-header {
            height: auto;
            position: relative;
            display: flex;
            align-items: flex-end;
            min-height: 0;
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
            padding: calc(var(--body-padding) * 0.9);
            width: 100%;
          }
          .ticket-event-name {
            margin: 0;
            font-size: var(--event-name-size);
            line-height: 1.15;
            font-weight: 800;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .ticket-event-line {
            margin: 1.1mm 0 0;
            font-size: var(--event-line-size);
            opacity: 0.95;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .ticket-body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-content: start;
            gap: var(--body-gap);
            padding: var(--body-padding);
            min-height: 0;
            overflow: hidden;
          }
          .ticket-meta {
            min-width: 0;
          }
          .ticket-label {
            margin: 0 0 1mm;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #64748b;
            font-size: var(--label-size);
            font-weight: 700;
          }
          .ticket-value {
            margin: 0 0 1.4mm;
            font-size: var(--value-size);
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .ticket-qr-wrap {
            min-width: calc(var(--qr-size) + 6mm);
            text-align: center;
          }
          .ticket-qr {
            width: var(--qr-size);
            height: var(--qr-size);
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            background: #fff;
            padding: var(--qr-padding);
          }
          .ticket-id {
            margin: 1.2mm 0 0;
            font-size: var(--id-size);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            color: #475569;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        <section class="tickets-root mode-${safeTicketsPerPage}">${pagesHtml}</section>
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
