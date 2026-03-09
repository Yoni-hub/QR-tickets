import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import SearchInput from "../../components/admin/SearchInput";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";
import ConfirmActionModal from "../../components/admin/ConfirmActionModal";
import PaginationControls from "../../components/admin/PaginationControls";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

const TICKET_ACTIONS = {
  invalidate: { endpoint: "invalidate", label: "Invalidate", confirm: "Invalidate this ticket?" },
  restore: { endpoint: "restore", label: "Restore", confirm: "Restore this ticket?" },
  resetUsage: { endpoint: "reset-usage", label: "Reset Usage", confirm: "Reset this ticket from used to unused?" },
};

export default function AdminTicketsPage() {
  const PAGE_SIZE = 5;
  const [params, setParams] = useSearchParams();
  const eventIdFilter = String(params.get("eventId") || "").trim();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [action, setAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/tickets", {
        params: {
          search: search.trim() || undefined,
          eventId: eventIdFilter || undefined,
        },
      });
      setItems(response.data.items || []);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [eventIdFilter]);

  const executeAction = async () => {
    if (!action) return;
    setActionLoading(true);
    try {
      const descriptor = TICKET_ACTIONS[action.type];
      if (action.type === "resend") {
        if (!action.latestDeliveryId) {
          throw new Error("No delivery record exists for this ticket.");
        }
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

  return (
    <section className="space-y-3">
      <div className="rounded border bg-white p-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search ticketPublicId, attendeeEmail, eventName, accessCode" />
        {eventIdFilter ? (
          <p className="mt-2 text-xs text-slate-600">
            Filtering by eventId: <span className="font-mono">{eventIdFilter}</span>{" "}
            <button
              className="text-blue-700 underline"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("eventId");
                setParams(next);
              }}
            >
              Clear
            </button>
          </p>
        ) : null}
        <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={load}>Search</button>
      </div>

      {loading ? <LoadingState label="Loading tickets..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No tickets found." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          {items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((ticket) => (
            <article key={ticket.ticketPublicId} className="rounded border bg-white p-3 text-sm">
              <p className="font-mono text-xs break-all">{ticket.ticketPublicId}</p>
              <p className="mt-1">Event: {ticket.eventName}</p>
              <p className="mt-1">Access Code: <span className="font-mono">{ticket.accessCode}</span></p>
              <p className="mt-1">Attendee Email: {ticket.attendeeEmail || "-"}</p>
              <p className="mt-1">Delivery: <StatusBadge value={ticket.deliveryStatus} /></p>
              <p className="mt-1">Opened: <StatusBadge value={ticket.openedStatus} /> ({ticket.openedCount})</p>
              <p className="mt-1">Scan: <StatusBadge value={ticket.scanStatus} /></p>
              <p className="mt-1">ScannedAt: {formatDate(ticket.scannedAt)}</p>
              <p className="mt-1">CreatedAt: {formatDate(ticket.createdAt)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${ticket.eventId}`}>View Event</Link>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(ticket.ticketUrl)}>Copy Ticket URL</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "invalidate", ...ticket })}>Invalidate</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "restore", ...ticket })}>Restore</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "resetUsage", ...ticket })}>Reset Used to Unused</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "resend", ...ticket })}>Resend Link</button>
              </div>
            </article>
          ))}
          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(items.length / PAGE_SIZE))}
            totalItems={items.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(items.length / PAGE_SIZE)), prev + 1))}
          />
        </div>
      ) : null}

      <ConfirmActionModal
        open={Boolean(action)}
        title={action?.type === "resend" ? "Resend Ticket Link" : action ? TICKET_ACTIONS[action.type].label : "Confirm"}
        message={action?.type === "resend" ? "Retry sending link for this ticket?" : action ? TICKET_ACTIONS[action.type].confirm : ""}
        onConfirm={executeAction}
        onCancel={() => setAction(null)}
        loading={actionLoading}
      />
    </section>
  );
}
