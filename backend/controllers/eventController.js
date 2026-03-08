const puppeteer = require("puppeteer");
const QRCode = require("qrcode");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const prisma = require("../utils/prisma");
const { createEvent, buildQrPayload } = require("../services/eventService");
const { generateTicketPublicId } = require("../utils/ticketPublicId");
const {
  renderTicketCardHtml,
  renderTicketDocumentHtml,
  resolveTicketDesign,
} = require("../services/ticketTemplate");

async function createLiveEvent(req, res) {
  try {
    const data = await createEvent(req.body || {}, false);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create event." });
  }
}

async function createDemoEvent(req, res) {
  try {
    const data = await createEvent(req.body || {}, true);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create demo event." });
  }
}

async function getEventByCode(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: {
      id: true,
      slug: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      accessCode: true,
      ticketType: true,
      ticketPrice: true,
      paymentInstructions: true,
      isDemo: true,
      createdAt: true,
      designJson: true,
    },
  });

  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const totalTickets = await prisma.ticket.count({ where: { eventId: event.id } });
  const scannedTickets = await prisma.ticket.count({ where: { eventId: event.id, status: "USED" } });

  const scans = await prisma.scanRecord.findMany({
    where: { eventId: event.id },
    orderBy: { scannedAt: "desc" },
    take: 100,
    select: { ticketPublicId: true, result: true, scannedAt: true },
  });

  res.json({
    event,
    totalTickets,
    scannedTickets,
    remainingTickets: totalTickets - scannedTickets,
    scans,
  });
}

async function getEventTickets(req, res) {
  const eventId = (req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }

  const tickets = await prisma.ticket.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: { ticketPublicId: true, status: true, scannedAt: true, qrPayload: true },
  });

  res.json({ eventId, tickets });
}

async function generateTicketsByAccessCode(req, res) {
  const accessCode = (req.params.accessCode || "").trim();
  const quantity = Math.max(1, Number.parseInt(String(req.body?.quantity || "1"), 10) || 1);
  if (!accessCode) {
    res.status(400).json({ error: "accessCode is required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({
    where: { accessCode },
    select: { id: true, accessCode: true, quantity: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return;
  }

  const eventName = String(req.body?.eventName || "").trim();
  const eventAddress = String(req.body?.eventAddress || "").trim();
  const rawEventDate = String(req.body?.eventDateTime || req.body?.dateTimeText || "").trim();
  const parsedEventDate = rawEventDate ? new Date(rawEventDate) : null;
  const ticketType = String(req.body?.ticketType || "").trim();
  const ticketPriceRaw = String(req.body?.ticketPrice || "").trim();
  const ticketPrice = ticketPriceRaw && !Number.isNaN(Number(ticketPriceRaw)) ? Number(ticketPriceRaw) : null;
  const designJson = req.body?.designJson && typeof req.body.designJson === "object" ? req.body.designJson : null;

  const ids = new Set();
  const rows = [];
  for (let index = 0; index < quantity; index += 1) {
    let ticketPublicId = generateTicketPublicId();
    while (ids.has(ticketPublicId)) {
      ticketPublicId = generateTicketPublicId();
    }
    ids.add(ticketPublicId);
    rows.push({
      eventId: event.id,
      ticketPublicId,
      qrPayload: buildQrPayload(ticketPublicId),
      status: "UNUSED",
    });
  }

  await prisma.ticket.createMany({ data: rows });
  await prisma.userEvent.update({
    where: { id: event.id },
    data: {
      quantity: (event.quantity || 0) + quantity,
      ...(eventName ? { eventName } : {}),
      ...(eventAddress ? { eventAddress } : {}),
      ...(parsedEventDate && !Number.isNaN(parsedEventDate.getTime()) ? { eventDate: parsedEventDate } : {}),
      ...(ticketType ? { ticketType } : {}),
      ...(ticketPriceRaw ? { ticketPrice } : {}),
      ...(designJson ? { designJson } : {}),
    },
  });

  res.status(201).json({
    created: quantity,
    eventId: event.id,
    accessCode: event.accessCode,
  });
}

async function updateEventInline(req, res) {
  const eventId = (req.params.eventId || "").trim();
  const accessCode = (req.body?.accessCode || "").trim();
  if (!eventId || !accessCode) {
    res.status(400).json({ error: "eventId and accessCode are required." });
    return;
  }

  const existing = await prisma.userEvent.findUnique({
    where: { id: eventId },
    select: { id: true, accessCode: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found." });
    return;
  }
  if (existing.accessCode !== accessCode) {
    res.status(403).json({ error: "Invalid access code for this event." });
    return;
  }

  const eventName = String(req.body?.eventName || "").trim();
  const eventAddress = String(req.body?.eventAddress || "").trim();
  const eventDateRaw = String(req.body?.eventDate || "").trim();
  const parsedEventDate = eventDateRaw ? new Date(eventDateRaw) : null;
  if (eventDateRaw && Number.isNaN(parsedEventDate?.getTime())) {
    res.status(400).json({ error: "Invalid eventDate." });
    return;
  }

  const updated = await prisma.userEvent.update({
    where: { id: eventId },
    data: {
      ...(eventName ? { eventName } : {}),
      ...(eventAddress ? { eventAddress } : {}),
      ...(parsedEventDate ? { eventDate: parsedEventDate } : {}),
    },
    select: {
      id: true,
      slug: true,
      eventName: true,
      eventDate: true,
      eventAddress: true,
      accessCode: true,
      ticketType: true,
      ticketPrice: true,
      paymentInstructions: true,
    },
  });

  res.json({ event: updated });
}

function normalizeTicketsPerPage(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(4, Math.max(1, parsed));
}

async function buildTicketsPdfBuffer(event, tickets, ticketsPerPage) {
  const cards = [];
  for (const ticket of tickets) {
    const payload = ticket.qrPayload || buildQrPayload(ticket.ticketPublicId);
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, width: 320 });
    const design = resolveTicketDesign(event);
    cards.push(
      renderTicketCardHtml({
        design,
        qrDataUrl,
        ticketPublicId: ticket.ticketPublicId,
      }),
    );
  }

  const safeTicketsPerPage = normalizeTicketsPerPage(ticketsPerPage);
  const pageSections = [];
  for (let index = 0; index < cards.length; index += safeTicketsPerPage) {
    const pageCards = cards
      .slice(index, index + safeTicketsPerPage)
      .map((cardHtml) => `<div class="ticket-slot">${cardHtml}</div>`)
      .join("");
    pageSections.push(
      `<section class="ticket-page mode-${safeTicketsPerPage}"><div class="ticket-grid">${pageCards}</div></section>`,
    );
  }

  const html = renderTicketDocumentHtml({
    pagesHtml: pageSections.join(""),
    ticketsPerPage: safeTicketsPerPage,
  });
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      printBackground: true,
      format: "A4",
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function buildFallbackPdfBuffer(event, tickets, ticketsPerPage) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 36;
  const safeTicketsPerPage = normalizeTicketsPerPage(ticketsPerPage);
  const verticalGap = 12;
  const usableHeight = pageHeight - margin * 2 - verticalGap * (safeTicketsPerPage - 1);
  const cardHeight = usableHeight / safeTicketsPerPage;

  for (let index = 0; index < tickets.length; index += 1) {
    if (index % safeTicketsPerPage === 0) {
      pdf.addPage([pageWidth, pageHeight]);
    }

    const page = pdf.getPages()[pdf.getPageCount() - 1];
    const slot = index % safeTicketsPerPage;
    const x = margin;
    const y = pageHeight - margin - cardHeight - slot * (cardHeight + verticalGap);
    const ticket = tickets[index];
    const payload = ticket.qrPayload || buildQrPayload(ticket.ticketPublicId);
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, width: 256 });
    const qrBase64 = qrDataUrl.split(",")[1];
    const qrImage = await pdf.embedPng(Buffer.from(qrBase64, "base64"));
    const headingSize = safeTicketsPerPage >= 4 ? 12 : safeTicketsPerPage === 3 ? 14 : 16;
    const detailSize = safeTicketsPerPage >= 4 ? 8 : 10;
    const ticketIdSize = safeTicketsPerPage >= 4 ? 9 : 11;
    const qrSize = Math.min(120, Math.max(72, cardHeight - 42));

    page.drawRectangle({
      x,
      y,
      width: pageWidth - margin * 2,
      height: cardHeight,
      borderWidth: 1,
      borderColor: rgb(0.8, 0.8, 0.8),
    });

    page.drawText(event.eventName, { x: x + 16, y: y + cardHeight - (headingSize + 12), size: headingSize, font: bold });
    page.drawText(new Date(event.eventDate).toLocaleString(), { x: x + 16, y: y + cardHeight - (headingSize + detailSize + 16), size: detailSize, font });
    page.drawText(event.eventAddress, { x: x + 16, y: y + cardHeight - (headingSize + detailSize * 2 + 20), size: detailSize, font });
    page.drawText(`Ticket ID: ${ticket.ticketPublicId}`, { x: x + 16, y: y + 14, size: ticketIdSize, font: bold });
    page.drawImage(qrImage, { x: pageWidth - margin - qrSize - 20, y: y + 10, width: qrSize, height: qrSize });
  }

  return Buffer.from(await pdf.save());
}

function normalizePdfOutput(payload) {
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  if (Array.isArray(payload)) return Buffer.from(payload);

  if (typeof payload === "string") {
    try {
      return normalizePdfOutput(JSON.parse(payload));
    } catch {
      return Buffer.from(payload, "utf8");
    }
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) return Buffer.from(payload.data);
    if (typeof payload.data === "string") return Buffer.from(payload.data, "base64");

    const numericKeys = Object.keys(payload)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));

    if (numericKeys.length > 0) {
      const values = numericKeys.map((key) => Number(payload[key]) || 0);
      return Buffer.from(values);
    }
  }

  return Buffer.alloc(0);
}

async function getTicketsPdf(req, res) {
  try {
    const eventId = (req.params.eventId || "").trim();
    if (!eventId) {
      res.status(400).json({ error: "eventId is required." });
      return;
    }

    const event = await prisma.userEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        eventName: true,
        eventDate: true,
        eventAddress: true,
        accessCode: true,
        ticketType: true,
        ticketPrice: true,
        designJson: true,
      },
    });

    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }

    const tickets = await prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      select: { ticketPublicId: true, qrPayload: true },
    });

    const ticketsPerPage = normalizeTicketsPerPage(req.query?.perPage);

    // Use deterministic fixed HTML print wrappers first; fallback to pdf-lib only if html rendering fails.
    let pdfBuffer;
    try {
      pdfBuffer = await buildTicketsPdfBuffer(event, tickets, ticketsPerPage);
    } catch (error) {
      console.error("html-pdf generation failed; using fallback pdf-lib renderer", error);
      pdfBuffer = await buildFallbackPdfBuffer(event, tickets, ticketsPerPage);
    }
    const output = normalizePdfOutput(pdfBuffer);
    if (!output.length) {
      throw new Error("PDF generation returned empty data.");
    }

    const safeName = (event.eventName || "tickets").replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-tickets.pdf"`);
    res.setHeader("Content-Length", String(output.length));
    res.send(output);
  } catch (error) {
    console.error("getTicketsPdf error", error);
    res.status(500).json({ error: "Could not generate tickets PDF." });
  }
}

module.exports = {
  createLiveEvent,
  createDemoEvent,
  getEventByCode,
  getEventTickets,
  generateTicketsByAccessCode,
  getTicketsPdf,
  updateEventInline,
};
