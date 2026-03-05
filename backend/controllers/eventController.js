const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const QRCode = require("qrcode");
const prisma = require("../utils/prisma");
const { createEvent, buildQrPayload } = require("../services/eventService");

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
      eventName: true,
      eventDate: true,
      eventAddress: true,
      accessCode: true,
      isDemo: true,
      createdAt: true,
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

async function getTicketsPdf(req, res) {
  const eventId = (req.params.eventId || "").trim();
  if (!eventId) {
    res.status(400).json({ error: "eventId is required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({
    where: { id: eventId },
    select: { id: true, eventName: true, eventDate: true, eventAddress: true },
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

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 36;
  const cardHeight = (pageHeight - margin * 3) / 2;

  for (let index = 0; index < tickets.length; index += 1) {
    if (index % 2 === 0) {
      pdf.addPage([pageWidth, pageHeight]);
    }

    const page = pdf.getPages()[pdf.getPageCount() - 1];
    const slot = index % 2;
    const x = margin;
    const y = slot === 0 ? pageHeight - margin - cardHeight : margin;

    page.drawRectangle({ x, y, width: pageWidth - margin * 2, height: cardHeight, borderWidth: 1, borderColor: rgb(0.8, 0.8, 0.8) });

    const ticket = tickets[index];
    const payload = ticket.qrPayload || buildQrPayload(ticket.ticketPublicId);
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, width: 256 });
    const qrBase64 = qrDataUrl.split(",")[1];
    const qrImage = await pdf.embedPng(Buffer.from(qrBase64, "base64"));

    page.drawText(event.eventName, { x: x + 16, y: y + cardHeight - 28, size: 16, font: bold });
    page.drawText(new Date(event.eventDate).toLocaleString(), { x: x + 16, y: y + cardHeight - 48, size: 10, font });
    page.drawText(event.eventAddress, { x: x + 16, y: y + cardHeight - 64, size: 10, font });
    page.drawText(`Ticket ID: ${ticket.ticketPublicId}`, { x: x + 16, y: y + 24, size: 11, font: bold });

    page.drawImage(qrImage, { x: pageWidth - margin - 150, y: y + 20, width: 120, height: 120 });
  }

  const pdfBytes = await pdf.save();
  const safeName = (event.eventName || "tickets").replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-tickets.pdf"`);
  res.send(Buffer.from(pdfBytes));
}

module.exports = {
  createLiveEvent,
  createDemoEvent,
  getEventByCode,
  getEventTickets,
  getTicketsPdf,
};
