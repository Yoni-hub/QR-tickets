import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import StatCard from "../../components/admin/StatCard";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";
import PaginationControls from "../../components/admin/PaginationControls";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminDashboardPage() {
  const PAGE_SIZE = 5;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [requestsPage, setRequestsPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [scansPage, setScansPage] = useState(1);
  const [failuresPage, setFailuresPage] = useState(1);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await adminApi.get("/overview");
        if (alive) {
          setData(response.data);
          setRequestsPage(1);
          setEventsPage(1);
          setScansPage(1);
          setFailuresPage(1);
        }
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

  const { metrics, recentEvents, recentScans, recentDeliveryFailures, recentTicketRequests } = data;

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
        <h2 className="text-lg font-semibold">Recent Ticket Requests</h2>
        {!recentTicketRequests?.length ? (
          <EmptyState label="No recent ticket requests." />
        ) : (
          <div className="mt-3 space-y-2">
            {recentTicketRequests.slice((requestsPage - 1) * PAGE_SIZE, requestsPage * PAGE_SIZE).map((request) => (
              <div key={request.requestId} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{request.eventName}</p>
                  <StatusBadge value={request.status} />
                </div>
                <p className="mt-1 text-slate-600">Buyer: {request.buyerName || "-"}{request.buyerEmail ? ` (${request.buyerEmail})` : ""}</p>
                <p className="mt-1 text-xs text-slate-500">Access code: <span className="font-mono">{request.accessCode}</span></p>
                <p className="mt-1 text-xs text-slate-500">Client token: <span className="font-mono break-all">{request.clientAccessToken || "-"}</span></p>
                {request.clientDashboardUrl ? (
                  <a className="mt-1 inline-block text-xs font-semibold text-blue-700 underline break-all" href={request.clientDashboardUrl} target="_blank" rel="noreferrer">
                    Open client dashboard
                  </a>
                ) : null}
              </div>
            ))}
            <PaginationControls
              page={requestsPage}
              totalPages={Math.max(1, Math.ceil(recentTicketRequests.length / PAGE_SIZE))}
              totalItems={recentTicketRequests.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setRequestsPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setRequestsPage((prev) => Math.min(Math.max(1, Math.ceil(recentTicketRequests.length / PAGE_SIZE)), prev + 1))}
            />
          </div>
        )}
      </article>

      <article className="rounded border bg-white p-3 sm:p-4">
        <h2 className="text-lg font-semibold">Recent Events</h2>
        {!recentEvents?.length ? (
          <EmptyState label="No recent events." />
        ) : (
          <div className="mt-3 space-y-2">
            {recentEvents.slice((eventsPage - 1) * PAGE_SIZE, eventsPage * PAGE_SIZE).map((event) => (
              <div key={event.eventId} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{event.eventName}</p>
                  <StatusBadge value={event.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">{formatDate(event.eventDate)} | {event.location}</p>
                <p className="mt-1 text-xs text-slate-500">Access code: <span className="font-mono">{event.accessCode}</span></p>
                <p className="mt-1 text-xs text-slate-500">Tickets: {event.ticketsTotal} | Scanned: {event.scannedCount}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link className="text-sm font-semibold text-blue-700" to={`/admin/events/${event.eventId}`}>View</Link>
                  <Link className="text-sm font-semibold text-blue-700" to={`/admin/tickets?eventId=${encodeURIComponent(event.eventId)}`}>Tickets</Link>
                </div>
              </div>
            ))}
            <PaginationControls
              page={eventsPage}
              totalPages={Math.max(1, Math.ceil(recentEvents.length / PAGE_SIZE))}
              totalItems={recentEvents.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setEventsPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setEventsPage((prev) => Math.min(Math.max(1, Math.ceil(recentEvents.length / PAGE_SIZE)), prev + 1))}
            />
          </div>
        )}
      </article>

      <article className="rounded border bg-white p-3 sm:p-4">
        <h2 className="text-lg font-semibold">Recent Scans</h2>
        {!recentScans?.length ? (
          <EmptyState label="No scans yet." />
        ) : (
          <div className="mt-3 space-y-2">
            {recentScans.slice((scansPage - 1) * PAGE_SIZE, scansPage * PAGE_SIZE).map((scan) => (
              <div key={scan.scanId} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{scan.eventName}</p>
                  <StatusBadge value={scan.result} />
                </div>
                <p className="mt-1 text-slate-600">{formatDate(scan.timestamp)}</p>
                <p className="mt-1 font-mono text-xs">{scan.ticketPublicId}</p>
              </div>
            ))}
            <PaginationControls
              page={scansPage}
              totalPages={Math.max(1, Math.ceil(recentScans.length / PAGE_SIZE))}
              totalItems={recentScans.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setScansPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setScansPage((prev) => Math.min(Math.max(1, Math.ceil(recentScans.length / PAGE_SIZE)), prev + 1))}
            />
          </div>
        )}
      </article>

      <article className="rounded border bg-white p-3 sm:p-4">
        <h2 className="text-lg font-semibold">Recent Delivery Failures</h2>
        {!recentDeliveryFailures?.length ? (
          <EmptyState label="No recent delivery failures." />
        ) : (
          <div className="mt-3 space-y-2">
            {recentDeliveryFailures.slice((failuresPage - 1) * PAGE_SIZE, failuresPage * PAGE_SIZE).map((delivery) => (
              <div key={delivery.deliveryId} className="rounded border border-red-200 bg-red-50 p-3 text-sm">
                <p className="font-semibold">{delivery.eventName}</p>
                <p className="mt-1">Recipient: {delivery.recipientEmail}</p>
                <p className="mt-1 font-mono text-xs">Ticket: {delivery.ticketPublicId}</p>
                <p className="mt-1 text-red-700">{delivery.providerMessage || "Unknown delivery error."}</p>
              </div>
            ))}
            <PaginationControls
              page={failuresPage}
              totalPages={Math.max(1, Math.ceil(recentDeliveryFailures.length / PAGE_SIZE))}
              totalItems={recentDeliveryFailures.length}
              pageSize={PAGE_SIZE}
              onPrev={() => setFailuresPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setFailuresPage((prev) => Math.min(Math.max(1, Math.ceil(recentDeliveryFailures.length / PAGE_SIZE)), prev + 1))}
            />
          </div>
        )}
      </article>
    </section>
  );
}
