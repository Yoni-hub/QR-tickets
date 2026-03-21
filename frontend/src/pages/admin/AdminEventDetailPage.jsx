import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import StatusBadge from "../../components/admin/StatusBadge";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminEventDetailPage() {
  const { eventId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

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

  if (loading) return <LoadingState label="Loading event detail..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState label="No event detail found." />;

  const { event, configurationSnapshot, scanSummary, deliverySummary } = data;

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
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">Title:</span> {configurationSnapshot?.title || "-"}</p>
          <p><span className="font-semibold">Date:</span> {formatDate(configurationSnapshot?.date)}</p>
          <p><span className="font-semibold">Location:</span> {configurationSnapshot?.location || "-"}</p>
          <p><span className="font-semibold">Tickets Requested:</span> {configurationSnapshot?.ticketsRequested ?? "-"}</p>
          <p><span className="font-semibold">Default Ticket Type:</span> {configurationSnapshot?.ticketType || "-"}</p>
          <p><span className="font-semibold">Default Ticket Price:</span> {configurationSnapshot?.ticketPrice != null ? `${configurationSnapshot?.designJson?.currency || "$"}${Number(configurationSnapshot.ticketPrice).toFixed(2)}` : "Ask organizer"}</p>
          <p><span className="font-semibold">Header Image:</span> {configurationSnapshot?.hasHeaderImage ? "Yes" : "No"}</p>
        </div>
        {Array.isArray(configurationSnapshot?.designJson?.ticketGroups) && configurationSnapshot.designJson.ticketGroups.length ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">Ticket Groups</p>
            {configurationSnapshot.designJson.ticketGroups.map((group, index) => (
              <div key={`${group.ticketType || "group"}-${index}`} className="rounded border bg-slate-50 p-2 text-xs">
                <p><span className="font-semibold">Type:</span> {group.ticketType || "-"}</p>
                <p><span className="font-semibold">Price:</span> {group.ticketPrice != null ? `${configurationSnapshot?.designJson?.currency || "$"}${Number(group.ticketPrice).toFixed(2)}` : "-"}</p>
                <p><span className="font-semibold">Header Text:</span> {group.headerText || "-"}</p>
              </div>
            ))}
          </div>
        ) : null}
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
    </section>
  );
}
