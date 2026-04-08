import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import SearchInput from "../../components/admin/SearchInput";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import ConfirmActionModal from "../../components/admin/ConfirmActionModal";
import PaginationControls from "../../components/admin/PaginationControls";
import StatusBadge from "../../components/admin/StatusBadge";

const TICKET_ACTIONS = {
  invalidate: { endpoint: "invalidate", label: "Invalidate", confirm: "Invalidate this ticket?" },
  restore: { endpoint: "restore", label: "Restore", confirm: "Restore this ticket?" },
  resetUsage: { endpoint: "reset-usage", label: "Reset Usage", confirm: "Reset this ticket to unused?" },
};

const TICKET_WINDOW_SIZE = 5;

function normalizeTicketType(value) {
  const text = String(value || "").trim();
  return text || "UNSPECIFIED";
}

function ticketTypeLabel(value) {
  return value === "UNSPECIFIED" ? "Unspecified" : value;
}

export default function AdminTicketsPage() {
  const PAGE_SIZE = 20;
  const [params, setParams] = useSearchParams();
  const eventIdFilter = String(params.get("eventId") || "").trim();
  const organizerAccessCodeFilter = String(params.get("organizerAccessCode") || params.get("search") || "").trim();
  const [search, setSearch] = useState(() => organizerAccessCodeFilter || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedEventByOrganizer, setSelectedEventByOrganizer] = useState({});
  const [selectedTypeByOrganizer, setSelectedTypeByOrganizer] = useState({});
  const [selectedTicketByOrganizer, setSelectedTicketByOrganizer] = useState({});
  const [ticketPageByOrganizer, setTicketPageByOrganizer] = useState({});

  const load = async (overrideSearch) => {
    setLoading(true);
    setError("");
    try {
      const resolvedSearch = String(overrideSearch ?? search).trim();
      const response = await adminApi.get("/tickets", {
        params: {
          search: resolvedSearch || undefined,
          eventId: eventIdFilter || undefined,
        },
      });
      const nextItems = Array.isArray(response.data?.items) ? response.data.items : [];

      const eventInit = {};
      const typeInit = {};
      const ticketInit = {};
      const pageInit = {};
      const grouped = new Map();
      for (const ticket of nextItems) {
        const organizerCode = String(ticket.organizerAccessCode || ticket.accessCode || "UNKNOWN").trim();
        if (!grouped.has(organizerCode)) grouped.set(organizerCode, []);
        grouped.get(organizerCode).push(ticket);
      }
      for (const [organizerCode, organizerTickets] of grouped.entries()) {
        let starter = organizerTickets[0];
        if (eventIdFilter) {
          const match = organizerTickets.find((ticket) => ticket.eventId === eventIdFilter);
          if (match) starter = match;
        }
        eventInit[organizerCode] = starter?.eventId || "";
        typeInit[organizerCode] = normalizeTicketType(starter?.ticketType);
        ticketInit[organizerCode] = starter?.ticketPublicId || "";
        pageInit[organizerCode] = 0;
      }
      setSelectedEventByOrganizer(eventInit);
      setSelectedTypeByOrganizer(typeInit);
      setSelectedTicketByOrganizer(ticketInit);
      setTicketPageByOrganizer(pageInit);
      setItems(nextItems);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizerAccessCodeFilter) setSearch(organizerAccessCodeFilter);
    load(organizerAccessCodeFilter || undefined);
  }, [eventIdFilter, organizerAccessCodeFilter]);

  const executeAction = async () => {
    if (!action) return;
    setActionLoading(true);
    try {
      const descriptor = TICKET_ACTIONS[action.type];
      if (action.type === "resend") {
        if (!action.latestDeliveryId) throw new Error("No delivery record exists for this ticket.");
        await adminApi.post(`/deliveries/${encodeURIComponent(action.latestDeliveryId)}/retry`);
      } else {
        await adminApi.patch(`/tickets/${encodeURIComponent(action.ticketPublicId)}/${descriptor.endpoint}`);
      }
      setAction(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const groupedRows = useMemo(() => {
    const organizerMap = new Map();
    for (const ticket of items) {
      const organizerCode = String(ticket.organizerAccessCode || ticket.accessCode || "UNKNOWN").trim();
      if (!organizerMap.has(organizerCode)) {
        organizerMap.set(organizerCode, {
          organizerAccessCode: organizerCode || "-",
          tickets: [],
        });
      }
      organizerMap.get(organizerCode).tickets.push(ticket);
    }

    return Array.from(organizerMap.values()).map((group) => {
      const eventsMap = new Map();
      for (const ticket of group.tickets) {
        if (!eventsMap.has(ticket.eventId)) {
          eventsMap.set(ticket.eventId, {
            eventId: ticket.eventId,
            eventName: ticket.eventName || "-",
            tickets: [],
          });
        }
        eventsMap.get(ticket.eventId).tickets.push(ticket);
      }

      const events = Array.from(eventsMap.values());
      const selectedEventId = selectedEventByOrganizer[group.organizerAccessCode] || events[0]?.eventId || "";
      const selectedEvent = events.find((event) => event.eventId === selectedEventId) || events[0] || null;
      const eventTickets = selectedEvent?.tickets || [];

      const typeSet = new Set(eventTickets.map((ticket) => normalizeTicketType(ticket.ticketType)));
      const ticketTypes = Array.from(typeSet.values());
      const selectedType = selectedTypeByOrganizer[group.organizerAccessCode] || ticketTypes[0] || "UNSPECIFIED";
      const effectiveType = ticketTypes.includes(selectedType) ? selectedType : (ticketTypes[0] || "UNSPECIFIED");

      const filteredTickets = eventTickets.filter((ticket) => normalizeTicketType(ticket.ticketType) === effectiveType);
      const maxPage = Math.max(0, Math.ceil(filteredTickets.length / TICKET_WINDOW_SIZE) - 1);
      const requestedPage = Number(ticketPageByOrganizer[group.organizerAccessCode] || 0);
      const currentPage = Math.min(maxPage, Math.max(0, requestedPage));
      const ticketWindow = filteredTickets.slice(currentPage * TICKET_WINDOW_SIZE, currentPage * TICKET_WINDOW_SIZE + TICKET_WINDOW_SIZE);

      const selectedTicketId = selectedTicketByOrganizer[group.organizerAccessCode] || filteredTickets[0]?.ticketPublicId || "";
      const selectedTicket = filteredTickets.find((ticket) => ticket.ticketPublicId === selectedTicketId) || filteredTickets[0] || null;

      return {
        organizerAccessCode: group.organizerAccessCode,
        events,
        selectedEventId,
        selectedEvent,
        ticketTypes,
        selectedType: effectiveType,
        filteredTickets,
        ticketWindow,
        currentPage,
        maxPage,
        selectedTicket,
      };
    });
  }, [items, selectedEventByOrganizer, selectedTypeByOrganizer, selectedTicketByOrganizer, ticketPageByOrganizer]);

  const pagedRows = groupedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3">
      <div className="rounded border bg-white p-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search organizer access code, event name, ticket number, buyer email"
        />
        {eventIdFilter ? (
          <p className="mt-2 text-xs text-slate-600">
            Filtering by eventId: <span className="font-mono">{eventIdFilter}</span>{" "}
            <button className="text-blue-700 underline" onClick={() => { const next = new URLSearchParams(params); next.delete("eventId"); setParams(next); }}>
              Clear
            </button>
          </p>
        ) : null}
        <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={load}>Search</button>
      </div>

      {loading ? <LoadingState label="Loading tickets..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !groupedRows.length ? <EmptyState label="No tickets found." /> : null}

      {!loading && !error && groupedRows.length ? (
        <>
          <div className="space-y-2 md:hidden">
            {pagedRows.map((row) => (
              <article key={row.organizerAccessCode} className="rounded border bg-white p-3 text-sm">
                <p className="text-xs text-slate-500">Organizer access code</p>
                <p className="font-mono">{row.organizerAccessCode || "-"}</p>

                <p className="mt-2 text-xs text-slate-500">Event name</p>
                <select
                  className="w-full rounded border p-2 text-sm"
                  value={row.selectedEventId}
                  onChange={(event) => {
                    const nextEventId = event.target.value;
                    setSelectedEventByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: nextEventId }));
                    setSelectedTypeByOrganizer((prev) => {
                      const nextEvent = row.events.find((item) => item.eventId === nextEventId);
                      const firstType = normalizeTicketType(nextEvent?.tickets?.[0]?.ticketType);
                      return { ...prev, [row.organizerAccessCode]: firstType };
                    });
                    setSelectedTicketByOrganizer((prev) => {
                      const nextEvent = row.events.find((item) => item.eventId === nextEventId);
                      const firstTicketId = nextEvent?.tickets?.[0]?.ticketPublicId || "";
                      return { ...prev, [row.organizerAccessCode]: firstTicketId };
                    });
                    setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: 0 }));
                  }}
                >
                  {row.events.map((eventOption) => (
                    <option key={eventOption.eventId} value={eventOption.eventId}>
                      {eventOption.eventName}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-slate-500">Ticket type</p>
                <select
                  className="w-full rounded border p-2 text-sm"
                  value={row.selectedType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    const nextTickets = (row.selectedEvent?.tickets || []).filter((ticket) => normalizeTicketType(ticket.ticketType) === nextType);
                    setSelectedTypeByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: nextType }));
                    setSelectedTicketByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: nextTickets[0]?.ticketPublicId || "" }));
                    setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: 0 }));
                  }}
                >
                  {row.ticketTypes.map((ticketType) => (
                    <option key={ticketType} value={ticketType}>
                      {ticketTypeLabel(ticketType)}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs text-slate-500">Ticket numbers</p>
                <div className="flex flex-wrap gap-1">
                  {row.ticketWindow.map((ticket) => (
                    <button
                      key={ticket.ticketPublicId}
                      className={`rounded border px-2 py-1 text-xs font-mono ${row.selectedTicket?.ticketPublicId === ticket.ticketPublicId ? "bg-slate-900 text-white" : "bg-white"}`}
                      onClick={() => setSelectedTicketByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: ticket.ticketPublicId }))}
                    >
                      {ticket.ticketPublicId}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    disabled={row.currentPage <= 0}
                    onClick={() => setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: Math.max(0, row.currentPage - 1) }))}
                  >
                    Back
                  </button>
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    disabled={row.currentPage >= row.maxPage}
                    onClick={() => setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: Math.min(row.maxPage, row.currentPage + 1) }))}
                  >
                    Next
                  </button>
                </div>

                <div className="mt-3 rounded border bg-slate-50 p-2">
                  <p className="text-xs text-slate-500">Selected ticket details</p>
                  <p className="text-xs">Currency: {row.selectedTicket?.currency || "-"}</p>
                  <p className="text-xs">Price: {row.selectedTicket?.price ?? "-"}</p>
                  <p className="text-xs">Quantity: {row.selectedTicket?.quantity ?? "-"}</p>
                  <p className="text-xs">Sold tickets: {row.selectedTicket?.soldTickets ?? "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">Actions status</p>
                  <StatusBadge value={row.selectedTicket?.scanStatus || "unknown"} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "invalidate", ...row.selectedTicket })}>Invalidate</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "restore", ...row.selectedTicket })}>Restore</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "resetUsage", ...row.selectedTicket })}>Reset Used</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "resend", ...row.selectedTicket })}>Resend</button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Organizer access code</th>
                  <th className="px-3 py-2">Event name</th>
                  <th className="px-3 py-2">Ticket type</th>
                  <th className="px-3 py-2">Ticket numbers (5)</th>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Quantity</th>
                  <th className="px-3 py-2">Sold tickets</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.organizerAccessCode} className="border-t align-top">
                    <td className="px-3 py-2 font-mono text-xs">{row.organizerAccessCode || "-"}</td>
                    <td className="px-3 py-2 min-w-[180px]">
                      <select
                        className="w-full rounded border p-2 text-sm"
                        value={row.selectedEventId}
                        onChange={(event) => {
                          const nextEventId = event.target.value;
                          const nextEvent = row.events.find((item) => item.eventId === nextEventId);
                          const firstType = normalizeTicketType(nextEvent?.tickets?.[0]?.ticketType);
                          const firstTicketId = nextEvent?.tickets?.[0]?.ticketPublicId || "";
                          setSelectedEventByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: nextEventId }));
                          setSelectedTypeByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: firstType }));
                          setSelectedTicketByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: firstTicketId }));
                          setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: 0 }));
                        }}
                      >
                        {row.events.map((eventOption) => (
                          <option key={eventOption.eventId} value={eventOption.eventId}>
                            {eventOption.eventName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 min-w-[160px]">
                      <select
                        className="w-full rounded border p-2 text-sm"
                        value={row.selectedType}
                        onChange={(event) => {
                          const nextType = event.target.value;
                          const nextTickets = (row.selectedEvent?.tickets || []).filter((ticket) => normalizeTicketType(ticket.ticketType) === nextType);
                          setSelectedTypeByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: nextType }));
                          setSelectedTicketByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: nextTickets[0]?.ticketPublicId || "" }));
                          setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: 0 }));
                        }}
                      >
                        {row.ticketTypes.map((ticketType) => (
                          <option key={ticketType} value={ticketType}>
                            {ticketTypeLabel(ticketType)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 min-w-[260px]">
                      <div className="flex flex-wrap gap-1">
                        {row.ticketWindow.map((ticket) => (
                          <button
                            key={ticket.ticketPublicId}
                            className={`rounded border px-2 py-1 text-xs font-mono ${row.selectedTicket?.ticketPublicId === ticket.ticketPublicId ? "bg-slate-900 text-white" : "bg-white"}`}
                            onClick={() => setSelectedTicketByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: ticket.ticketPublicId }))}
                          >
                            {ticket.ticketPublicId}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          disabled={row.currentPage <= 0}
                          onClick={() => setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: Math.max(0, row.currentPage - 1) }))}
                        >
                          Back
                        </button>
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          disabled={row.currentPage >= row.maxPage}
                          onClick={() => setTicketPageByOrganizer((prev) => ({ ...prev, [row.organizerAccessCode]: Math.min(row.maxPage, row.currentPage + 1) }))}
                        >
                          Next
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.selectedTicket?.currency || "-"}</td>
                    <td className="px-3 py-2">{row.selectedTicket?.price ?? "-"}</td>
                    <td className="px-3 py-2">{row.selectedTicket?.quantity ?? "-"}</td>
                    <td className="px-3 py-2">{row.selectedTicket?.soldTickets ?? "-"}</td>
                    <td className="px-3 py-2 min-w-[240px]">
                      <div className="mb-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Status</p>
                        <StatusBadge value={row.selectedTicket?.scanStatus || "unknown"} />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "invalidate", ...row.selectedTicket })}>Invalidate</button>
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "restore", ...row.selectedTicket })}>Restore</button>
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "resetUsage", ...row.selectedTicket })}>Reset Used</button>
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => row.selectedTicket && setAction({ type: "resend", ...row.selectedTicket })}>Resend</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(groupedRows.length / PAGE_SIZE))}
            totalItems={groupedRows.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(groupedRows.length / PAGE_SIZE)), prev + 1))}
          />
        </>
      ) : null}

      <ConfirmActionModal
        open={Boolean(action)}
        title={action?.type === "resend" ? "Resend Ticket Link" : action ? TICKET_ACTIONS[action.type]?.label : "Confirm"}
        message={action?.type === "resend" ? "Retry sending link for this ticket?" : action ? TICKET_ACTIONS[action.type]?.confirm : ""}
        onConfirm={executeAction}
        onCancel={() => setAction(null)}
        loading={actionLoading}
      />
    </section>
  );
}
