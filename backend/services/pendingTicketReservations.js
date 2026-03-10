const DEFAULT_TICKET_TYPE = "General";

function normalizeTicketType(value, fallback = DEFAULT_TICKET_TYPE) {
  return String(value || "").trim() || String(fallback || DEFAULT_TICKET_TYPE).trim() || DEFAULT_TICKET_TYPE;
}

function parseTicketSelections(rawSelections, fallbackTicketType, fallbackQuantity) {
  if (Array.isArray(rawSelections) && rawSelections.length) {
    const normalized = rawSelections
      .map((item) => ({
        ticketType: normalizeTicketType(item?.ticketType, fallbackTicketType),
        quantity: Math.max(0, Number.parseInt(String(item?.quantity || "0"), 10) || 0),
      }))
      .filter((item) => item.quantity > 0);
    if (normalized.length) return normalized;
  }

  const fallbackQty = Math.max(0, Number.parseInt(String(fallbackQuantity || "0"), 10) || 0);
  if (fallbackQty < 1) return [];
  return [{ ticketType: normalizeTicketType(fallbackTicketType), quantity: fallbackQty }];
}

function reservePendingTicketIds({ availableTickets, pendingRequests, fallbackTicketType }) {
  const queueByType = new Map();
  for (const ticket of availableTickets || []) {
    const type = normalizeTicketType(ticket?.ticketType, fallbackTicketType);
    if (!queueByType.has(type)) queueByType.set(type, []);
    queueByType.get(type).push(ticket.id);
  }

  const reservedIds = new Set();
  for (const request of pendingRequests || []) {
    const selections = parseTicketSelections(
      request?.ticketSelections,
      request?.ticketType || fallbackTicketType,
      request?.quantity,
    );
    for (const selection of selections) {
      const type = normalizeTicketType(selection.ticketType, fallbackTicketType);
      const queue = queueByType.get(type) || [];
      let needed = selection.quantity;
      while (needed > 0 && queue.length) {
        const ticketId = queue.shift();
        if (!ticketId || reservedIds.has(ticketId)) continue;
        reservedIds.add(ticketId);
        needed -= 1;
      }
    }
  }

  return reservedIds;
}

module.exports = {
  DEFAULT_TICKET_TYPE,
  normalizeTicketType,
  reservePendingTicketIds,
};
