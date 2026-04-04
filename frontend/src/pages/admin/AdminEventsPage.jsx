import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import FilterBar from "../../components/admin/FilterBar";
import SearchInput from "../../components/admin/SearchInput";
import StatusBadge from "../../components/admin/StatusBadge";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import ConfirmActionModal from "../../components/admin/ConfirmActionModal";
import PaginationControls from "../../components/admin/PaginationControls";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

const EVENT_ACTIONS = {
  disable: { label: "Disable Event", endpoint: "disable", confirm: "Disable this event? The public event page will go offline." },
  enable: { label: "Enable Event", endpoint: "enable", confirm: "Enable this event?" },
  archive: { label: "Archive Event", endpoint: "archive", confirm: "Archive this event?" },
  rotate: { label: "Rotate Access Code", endpoint: "rotate-access-code", confirm: "Rotate access code? The organizer's current code will stop working immediately." },
  lockScanner: { label: "Lock Scanner", endpoint: "lock-scanner", confirm: "Lock the scanner? All scan attempts for this event will be blocked." },
  unlockScanner: { label: "Unlock Scanner", endpoint: "unlock-scanner", confirm: "Unlock the scanner?" },
};

export default function AdminEventsPage() {
  const PAGE_SIZE = 20;
  const [urlParams] = useSearchParams();
  const [search, setSearch] = useState(() => urlParams.get("search") || "");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [action, setAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [page, setPage] = useState(1);

  const queryParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [search, status, dateFrom, dateTo],
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/events", { params: queryParams });
      setItems(response.data.items || []);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const executeAction = async () => {
    if (!action) return;
    setActionLoading(true);
    try {
      const descriptor = EVENT_ACTIONS[action.type];
      await adminApi.patch(`/events/${encodeURIComponent(action.eventId)}/${descriptor.endpoint}`);
      setAction(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const pagedItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search eventName or accessCode" />
        <select className="rounded border p-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input className="rounded border p-2 text-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="rounded border p-2 text-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button className="rounded border bg-white px-3 py-2 text-sm" onClick={load}>Apply Filters</button>
      </FilterBar>

      {loading ? <LoadingState label="Loading events..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No events found for current filters." /> : null}

      {!loading && !error && items.length ? (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {pagedItems.map((event) => (
              <article key={event.eventId} className="rounded border bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{event.eventName}</p>
                  <StatusBadge value={event.status} />
                </div>
                <p className="mt-1 break-all text-xs text-slate-600">ID: <span className="font-mono">{event.eventId}</span></p>
                <p className="mt-1 text-slate-600">{formatDate(event.eventDate)}{event.location ? ` · ${event.location}` : ""}</p>
                <p className="mt-1 text-xs">Access code: <span className="font-mono">{event.accessCode}</span></p>
                <p className="mt-1 text-xs">Tickets {event.ticketsTotal} | Scanned {event.ticketsScanned} | Remaining {event.ticketsRemaining}</p>
                <p className="mt-1 text-xs text-slate-500">Created {formatDate(event.createdAt)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${event.eventId}`}>View</Link>
                  <Link className="rounded border px-2 py-1 text-xs" to={`/admin/tickets?eventId=${encodeURIComponent(event.eventId)}`}>Tickets</Link>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "disable", ...event })}>Disable</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "enable", ...event })}>Enable</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "archive", ...event })}>Archive</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "rotate", ...event })}>Rotate Code</button>
                  {event.scannerLocked
                    ? <button className="rounded border border-green-400 bg-green-50 px-2 py-1 text-xs text-green-700" onClick={() => setAction({ type: "unlockScanner", ...event })}>Unlock Scanner</button>
                    : <button className="rounded border border-orange-400 bg-orange-50 px-2 py-1 text-xs text-orange-700" onClick={() => setAction({ type: "lockScanner", ...event })}>Lock Scanner</button>
                  }
                </div>
              </article>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Event Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Organizer</th>
                  <th className="px-3 py-2">Event Date</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Access Code</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Scanned</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((event) => (
                  <tr key={event.eventId} className="border-t align-top hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="font-semibold">{event.eventName}</p>
                      <p className="text-xs font-mono text-slate-400">{event.eventId}</p>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge value={event.status} />
                      {event.scannerLocked ? <span className="mt-1 block rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">Scanner Locked</span> : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {event.organizerName ? <p className="font-medium">{event.organizerName}</p> : null}
                      {event.organizerEmail ? <p className="text-slate-500">{event.organizerEmail}</p> : null}
                      {event.organizerAccessCode ? (
                        <Link className="text-blue-600 hover:underline font-mono" to={`/admin/events?search=${encodeURIComponent(event.organizerAccessCode)}`}>
                          {event.organizerAccessCode}
                        </Link>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(event.eventDate)}</td>
                    <td className="px-3 py-2">{event.location || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.accessCode}</td>
                    <td className="px-3 py-2">{event.ticketsTotal}</td>
                    <td className="px-3 py-2">{event.ticketsScanned}</td>
                    <td className="px-3 py-2">{event.ticketsRemaining}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{formatDate(event.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Link className="rounded border px-2 py-1 text-xs hover:bg-slate-50" to={`/admin/events/${event.eventId}`}>View</Link>
                        <Link className="rounded border px-2 py-1 text-xs hover:bg-slate-50" to={`/admin/tickets?eventId=${encodeURIComponent(event.eventId)}`}>Tickets</Link>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "disable", ...event })}>Disable</button>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "enable", ...event })}>Enable</button>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "archive", ...event })}>Archive</button>
                        <button className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => setAction({ type: "rotate", ...event })}>Rotate Code</button>
                        {event.scannerLocked
                          ? <button className="rounded border border-green-400 bg-green-50 px-2 py-1 text-xs text-green-700" onClick={() => setAction({ type: "unlockScanner", ...event })}>Unlock Scanner</button>
                          : <button className="rounded border border-orange-400 bg-orange-50 px-2 py-1 text-xs text-orange-700" onClick={() => setAction({ type: "lockScanner", ...event })}>Lock Scanner</button>
                        }
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
        title={action ? EVENT_ACTIONS[action.type].label : "Confirm"}
        message={action ? EVENT_ACTIONS[action.type].confirm : ""}
        confirmLabel="Confirm"
        onConfirm={executeAction}
        onCancel={() => setAction(null)}
        loading={actionLoading}
      />
    </section>
  );
}
