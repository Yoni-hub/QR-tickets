import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import StatCard from "../../components/admin/StatCard";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await adminApi.get("/overview");
        if (alive) setData(response.data);
      } catch (requestError) {
        if (alive) setError(requestError.response?.data?.error || "Could not load admin overview.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <LoadingState label="Loading admin dashboard..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState label="No admin overview data." />;

  const { metrics, recentEvents, recentScans, recentDeliveryFailures } = data;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Events" value={metrics.totalEvents} />
        <StatCard label="Total Tickets" value={metrics.totalTickets} />
        <StatCard label="Total Scans" value={metrics.totalScans} />
        <StatCard label="Valid Scans" value={metrics.validScans} />
        <StatCard label="Used Scans" value={metrics.usedScans} />
        <StatCard label="Invalid Scans" value={metrics.invalidScans} />
        <StatCard label="Deliveries Sent" value={metrics.deliveriesSent} />
        <StatCard label="Delivery Failures" value={metrics.deliveryFailures} />
        <StatCard label="Events Today" value={metrics.eventsCreatedToday} />
      </div>

      <article className="rounded border bg-white p-3 sm:p-4">
        <h2 className="text-lg font-semibold">Recent Events</h2>
        {!recentEvents?.length ? (
          <EmptyState label="No recent events." />
        ) : (
          <div className="mt-3 space-y-2">
            {recentEvents.map((event) => (
              <div key={event.eventId} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{event.eventName}</p>
                  <StatusBadge value={event.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{formatDate(event.eventDate)} | {event.location}</p>
                <p className="mt-1 text-xs text-slate-500">Access code: <span className="font-mono">{event.accessCode}</span></p>
                <p className="mt-1 text-xs text-slate-500">Tickets: {event.ticketsTotal} | Scanned: {event.scannedCount}</p>
                <div className="mt-2">
                  <Link className="text-sm font-semibold text-blue-700" to={`/admin/events/${event.eventId}`}>View</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="rounded border bg-white p-3 sm:p-4">
        <h2 className="text-lg font-semibold">Recent Scans</h2>
        {!recentScans?.length ? (
          <EmptyState label="No scans yet." />
        ) : (
          <div className="mt-3 space-y-2">
            {recentScans.map((scan) => (
              <div key={scan.scanId} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{scan.eventName}</p>
                  <StatusBadge value={scan.result} />
                </div>
                <p className="mt-1 text-slate-600">{formatDate(scan.timestamp)}</p>
                <p className="mt-1 font-mono text-xs">{scan.ticketPublicId}</p>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="rounded border bg-white p-3 sm:p-4">
        <h2 className="text-lg font-semibold">Recent Delivery Failures</h2>
        {!recentDeliveryFailures?.length ? (
          <EmptyState label="No recent delivery failures." />
        ) : (
          <div className="mt-3 space-y-2">
            {recentDeliveryFailures.map((delivery) => (
              <div key={delivery.deliveryId} className="rounded border border-red-200 bg-red-50 p-3 text-sm">
                <p className="font-semibold">{delivery.eventName}</p>
                <p className="mt-1">Recipient: {delivery.recipientEmail}</p>
                <p className="mt-1 font-mono text-xs">Ticket: {delivery.ticketPublicId}</p>
                <p className="mt-1 text-red-700">{delivery.providerMessage || "Unknown delivery error."}</p>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}