import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import StatusBadge from "../../components/admin/StatusBadge";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import ConfirmActionModal from "../../components/admin/ConfirmActionModal";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

const TICKET_ACTIONS = {
  invalidate: { endpoint: "invalidate", label: "Invalidate Ticket", confirm: "Invalidate this ticket?" },
  restore: { endpoint: "restore", label: "Restore Ticket", confirm: "Restore this ticket?" },
};

export default function AdminEventDetailPage() {
  const { eventId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [ticketAction, setTicketAction] = useState(null);
  const [ticketActionLoading, setTicketActionLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get(`/events/${encodeURIComponent(eventId)}`);
      setData(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load event detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) load();
  }, [eventId]);

  const executeTicketAction = async () => {
    if (!ticketAction) return;
    setTicketActionLoading(true);
    try {
      const descriptor = TICKET_ACTIONS[ticketAction.type];
      await adminApi.patch(`/tickets/${encodeURIComponent(ticketAction.ticketPublicId)}/${descriptor.endpoint}`);
      setTicketAction(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Ticket action failed.");
    } finally {
      setTicketActionLoading(false);
    }
  };

  if (loading) return <LoadingState label="Loading event detail..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState label="No event detail found." />;

  const { event, configurationSnapshot, tickets, scanSummary, deliverySummary } = data;

  return (
    <section className="space-y-3">
      <article className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">{event.eventName}</h2>
          <StatusBadge value={event.status} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-semibold">Event Date:</span> {formatDate(event.eventDate)}</p>
          <p><span className="font-semibold">Location:</span> {event.location}</p>
          <p><span className="font-semibold">Access Code:</span> <span className="font-mono">{event.accessCode}</span></p>
          <p><span className="font-semibold">Created:</span> {formatDate(event.createdAt)}</p>
          <p><span className="font-semibold">Tickets Total:</span> {event.ticketsTotal}</p>
          <p><span className="font-semibold">Scanned:</span> {event.ticketsScanned}</p>
          <p><span className="font-semibold">Remaining:</span> {event.ticketsRemaining}</p>
          <p><span className="font-semibold">Deliveries Sent:</span> {event.deliveriesSent}</p>
          <p><span className="font-semibold">Deliveries Failed:</span> {event.deliveriesFailed}</p>
          <p><span className="font-semibold">Last Scan:</span> {formatDate(event.lastScanAt)}</p>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Event Configuration Snapshot</h3>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-3 text-xs">{JSON.stringify(configurationSnapshot, null, 2)}</pre>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Event Scan Summary</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <p className="rounded border p-2">VALID: <span className="font-semibold">{scanSummary.VALID}</span></p>
          <p className="rounded border p-2">USED: <span className="font-semibold">{scanSummary.USED}</span></p>
          <p className="rounded border p-2">INVALID: <span className="font-semibold">{scanSummary.INVALID}</span></p>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Event Delivery Summary</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <p className="rounded border p-2">Sent: <span className="font-semibold">{deliverySummary.sent}</span></p>
          <p className="rounded border p-2">Failed: <span className="font-semibold">{deliverySummary.failed}</span></p>
          <p className="rounded border p-2">Unknown: <span className="font-semibold">{deliverySummary.unknown}</span></p>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Event Tickets</h3>
        {!tickets?.length ? (
          <EmptyState label="No tickets in this event." />
        ) : (
          <div className="mt-3 space-y-2">
            {tickets.map((ticket) => (
              <div key={ticket.ticketPublicId} className="rounded border p-3 text-sm">
                <p className="font-mono text-xs break-all">{ticket.ticketPublicId}</p>
                <p className="mt-1">Delivery: <StatusBadge value={ticket.deliveryStatus} /></p>
                <p className="mt-1">Opened: {ticket.openedCount}</p>
                <p className="mt-1">Scan: <StatusBadge value={ticket.scanStatus} /></p>
                <p className="mt-1">ScannedAt: {formatDate(ticket.scannedAt)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className="rounded border px-2 py-1 text-xs" href={ticket.ticketUrl} target="_blank" rel="noreferrer">View Ticket</a>
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => navigator.clipboard.writeText(ticket.ticketUrl)}
                  >
                    Copy Ticket URL
                  </button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setTicketAction({ type: "invalidate", ...ticket })}>Invalidate</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setTicketAction({ type: "restore", ...ticket })}>Restore</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <ConfirmActionModal
        open={Boolean(ticketAction)}
        title={ticketAction ? TICKET_ACTIONS[ticketAction.type].label : "Confirm"}
        message={ticketAction ? TICKET_ACTIONS[ticketAction.type].confirm : ""}
        onConfirm={executeTicketAction}
        onCancel={() => setTicketAction(null)}
        loading={ticketActionLoading}
      />
    </section>
  );
}