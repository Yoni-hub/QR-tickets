import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import FilterBar from "../../components/admin/FilterBar";
import SearchInput from "../../components/admin/SearchInput";
import StatusBadge from "../../components/admin/StatusBadge";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import ConfirmActionModal from "../../components/admin/ConfirmActionModal";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

const EVENT_ACTIONS = {
  disable: { label: "Disable Event", endpoint: "disable", confirm: "Disable this event?" },
  enable: { label: "Enable Event", endpoint: "enable", confirm: "Enable this event?" },
  archive: { label: "Archive Event", endpoint: "archive", confirm: "Archive this event?" },
  rotate: { label: "Rotate Access Code", endpoint: "rotate-access-code", confirm: "Rotate access code for this event?" },
};

export default function AdminEventsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [action, setAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

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
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load events.");
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

  return (
    <section className="space-y-3">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search eventName or accessCode" />
        <select className="rounded border p-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input className="rounded border p-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <input className="rounded border p-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </FilterBar>

      <div className="flex gap-2">
        <button className="rounded border bg-white px-3 py-2 text-sm" onClick={load}>Apply Filters</button>
      </div>

      {loading ? <LoadingState label="Loading events..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No events found for current filters." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          {items.map((event) => (
            <article key={event.eventId} className="rounded border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{event.eventName}</p>
                <StatusBadge value={event.status} />
              </div>
              <p className="mt-1 break-all text-xs text-slate-600">eventId: <span className="font-mono">{event.eventId}</span></p>
              <p className="mt-1 text-slate-600">{formatDate(event.eventDate)} | {event.location}</p>
              <p className="mt-1 text-xs">Access code: <span className="font-mono">{event.accessCode}</span></p>
              <p className="mt-1 text-xs">Tickets {event.ticketsTotal} | Scanned {event.ticketsScanned} | Remaining {event.ticketsRemaining}</p>
              <p className="mt-1 text-xs text-slate-500">Created {formatDate(event.createdAt)}</p>

              <div className="mt-2 flex flex-wrap gap-2">
                <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${event.eventId}`}>View Event</Link>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "disable", ...event })}>Disable</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "enable", ...event })}>Enable</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "archive", ...event })}>Archive</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "rotate", ...event })}>Rotate Access Code</button>
              </div>
            </article>
          ))}
        </div>
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