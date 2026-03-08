import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import SearchInput from "../../components/admin/SearchInput";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";
import ConfirmActionModal from "../../components/admin/ConfirmActionModal";

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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [action, setAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/tickets", {
        params: { search: search.trim() || undefined },
      });
      setItems(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
        <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={load}>Search</button>
      </div>

      {loading ? <LoadingState label="Loading tickets..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No tickets found." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          {items.map((ticket) => (
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
