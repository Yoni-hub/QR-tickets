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
  const PAGE_SIZE = 20;
  const [params, setParams] = useSearchParams();
  const eventIdFilter = String(params.get("eventId") || "").trim();
  const [search, setSearch] = useState(() => params.get("search") || "");
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

  useEffect(() => { load(); }, [eventIdFilter]);

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

  const pagedItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3">
      <div className="rounded border bg-white p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search ticketPublicId, attendeeEmail, eventName, accessCode" />
        </div>
        {eventIdFilter ? (
          <p className="text-xs text-slate-600">
            Filtering by eventId: <span className="font-mono">{eventIdFilter}</span>{" "}
            <button className="text-blue-700 underline" onClick={() => { const n = new URLSearchParams(params); n.delete("eventId"); setParams(n); }}>Clear</button>
          </p>
        ) : null}
        <button className="rounded border px-3 py-2 text-sm" onClick={load}>Search</button>
      </div>

      {loading ? <LoadingState label="Loading tickets..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No tickets found." /> : null}

      {!loading && !error && items.length ? (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {pagedItems.map((ticket) => (
              <article key={ticket.ticketPublicId} className="rounded border bg-white p-3 text-sm">
                <p className="font-mono text-xs break-all">{ticket.ticketPublicId}</p>
                <p className="mt-1 font-semibold">{ticket.eventName}</p>
                <p className="mt-0.5 text-xs text-slate-500">Access Code: <span className="font-mono">{ticket.accessCode}</span></p>
                <p className="mt-1 text-xs">Type: {ticket.ticketType || "-"}</p>
                <p className="mt-1 text-xs">Buyer: {ticket.attendeeEmail || "-"}</p>
                <p className="mt-1 text-xs">Sold: {ticket.sold ? "YES" : "NO"}</p>
                <p className="mt-1 flex items-center gap-1 text-xs">Scan: <StatusBadge value={ticket.scanStatus} /></p>
                <p className="mt-1 text-xs text-slate-500">Scanned: {formatDate(ticket.scannedAt)}</p>
                <p className="mt-1 text-xs text-slate-500">Created: {formatDate(ticket.createdAt)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${ticket.eventId}`}>View Event</Link>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(ticket.ticketUrl)}>Copy URL</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "invalidate", ...ticket })}>Invalidate</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "restore", ...ticket })}>Restore</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "resetUsage", ...ticket })}>Reset Used</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "resend", ...ticket })}>Resend</button>
                </div>
              </article>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Ticket ID</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Access Code</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Buyer</th>
                  <th className="px-3 py-2">Sold</th>
                  <th className="px-3 py-2">Scan</th>
                  <th className="px-3 py-2">Scanned At</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((ticket) => (
                  <tr key={ticket.ticketPublicId} className="border-t align-top hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs break-all max-w-[160px]">{ticket.ticketPublicId}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{ticket.eventName}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{ticket.accessCode}</td>
                    <td className="px-3 py-2">{ticket.ticketType || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 text-xs">{ticket.attendeeEmail || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2">{ticket.sold ? "YES" : "NO"}</td>
                    <td className="px-3 py-2"><StatusBadge value={ticket.scanStatus} /></td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{formatDate(ticket.scannedAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{formatDate(ticket.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Link className="rounded border px-2 py-1 text-xs hover:bg-slate-50" to={`/admin/events/${ticket.eventId}`}>Event</Link>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => navigator.clipboard.writeText(ticket.ticketUrl)}>Copy URL</button>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "invalidate", ...ticket })}>Invalidate</button>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "restore", ...ticket })}>Restore</button>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "resetUsage", ...ticket })}>Reset Used</button>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "resend", ...ticket })}>Resend</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(items.length / PAGE_SIZE))}
            totalItems={items.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(Math.max(1, Math.ceil(items.length / PAGE_SIZE)), p + 1))}
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
