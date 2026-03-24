const prisma = require("./prisma");

const DAILY_EVENT_CAP = 50;
const DAILY_TICKET_CAP = 10000;

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function checkDailyEventCap() {
  const count = await prisma.userEvent.count({
    where: { createdAt: { gte: startOfTodayUtc() } },
  });
  if (count >= DAILY_EVENT_CAP) {
    const error = new Error("Daily event creation limit reached. Try again tomorrow.");
    error.statusCode = 429;
    throw error;
  }
}

async function checkDailyTicketCap(requested) {
  const result = await prisma.ticket.count({
    where: { createdAt: { gte: startOfTodayUtc() } },
  });
  if (result + requested > DAILY_TICKET_CAP) {
    const error = new Error("Daily ticket generation limit reached. Try again tomorrow.");
    error.statusCode = 429;
    throw error;
  }
}

module.exports = { checkDailyEventCap, checkDailyTicketCap, DAILY_EVENT_CAP, DAILY_TICKET_CAP };
