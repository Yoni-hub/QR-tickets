const prisma = require("../utils/prisma");

async function scanTicket(req, res) {
  const accessCode = (req.body?.accessCode || "").trim();
  const ticketPublicId = (req.body?.ticketPublicId || "").trim();

  if (!accessCode || !ticketPublicId) {
    res.status(400).json({ error: "accessCode and ticketPublicId are required." });
    return;
  }

  const event = await prisma.userEvent.findUnique({ where: { accessCode } });
  if (!event) {
    res.json({ result: "INVALID" });
    return;
  }

  const ticket = await prisma.ticket.findFirst({ where: { eventId: event.id, ticketPublicId } });
  if (!ticket) {
    await prisma.scanRecord.create({ data: { eventId: event.id, ticketPublicId, result: "INVALID" } });
    res.json({ result: "INVALID" });
    return;
  }

  if (ticket.status === "USED") {
    await prisma.scanRecord.create({ data: { eventId: event.id, ticketId: ticket.id, ticketPublicId, result: "USED" } });
    res.json({ result: "USED", scannedAt: ticket.scannedAt });
    return;
  }

  const scannedAt = new Date();
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "USED", scannedAt },
  });

  await prisma.scanRecord.create({
    data: { eventId: event.id, ticketId: ticket.id, ticketPublicId, result: "VALID", scannedAt },
  });

  res.json({ result: "VALID", scannedAt });
}

module.exports = { scanTicket };
