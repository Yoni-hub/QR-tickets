import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

export default function AdminScansPage() {
  const PAGE_SIZE = 20;
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [markTarget, setMarkTarget] = useState(null);
  const [markLoading, setMarkLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/scans", {
        params: {
          search: search.trim() || undefined,
          result: result || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      setItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load scans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markSuspicious = async () => {
    if (!markTarget) return;
    setMarkLoading(true);
    try {
      await adminApi.patch(`/scans/${encodeURIComponent(markTarget.scanId)}/mark-suspicious`, {
        note: markTarget.note || "",
      });
      setMarkTarget(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not mark suspicious.");
    } finally {
      setMarkLoading(false);
    }
  };

  const pagedItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search organizer code, event name, ticket number" />
        <select className="rounded border p-2 text-sm" value={result} onChange={(event) => setResult(event.target.value)}>
          <option value="">All outcomes</option>
          <option value="VALID">VALID</option>
          <option value="USED">USED</option>
          <option value="INVALID">INVALID</option>
        </select>
        <input className="rounded border p-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <input className="rounded border p-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        <button className="rounded border bg-white px-3 py-2 text-sm" onClick={load}>Apply Filters</button>
      </FilterBar>

      {loading ? <LoadingState label="Loading scans..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No scans found." /> : null}

      {!loading && !error && items.length ? (
        <>
          <div className="space-y-2 md:hidden">
            {pagedItems.map((scan) => (
              <article key={scan.scanId} className="rounded border bg-white p-3 text-sm">
                <p className="text-xs text-slate-500">Organizer access code</p>
                <p className="font-mono">{scan.organizerAccessCode || "-"}</p>
                <p className="mt-1 text-xs text-slate-500">Event name</p>
                <p>{scan.eventName}</p>
                <p className="mt-1 text-xs text-slate-500">Ticket number</p>
                <p className="font-mono">{scan.ticketPublicId}</p>
                <p className="mt-1 text-xs text-slate-500">Scan outcome</p>
                <StatusBadge value={scan.result} />
                <p className="mt-1 text-xs text-slate-500">Scan date &amp; time</p>
                <p>{formatDate(scan.timestamp)}</p>
                <button className="mt-2 rounded border px-2 py-1 text-xs" onClick={() => setMarkTarget({ ...scan, note: "" })}>
                  Mark Suspicious
                </button>
                {scan.eventId ? <Link className="mt-2 ml-2 inline-block rounded border px-2 py-1 text-xs" to={`/admin/events/${scan.eventId}`}>View Event</Link> : null}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Organizer access code</th>
                  <th className="px-3 py-2">Event name</th>
                  <th className="px-3 py-2">Ticket number</th>
                  <th className="px-3 py-2">Scan outcome</th>
                  <th className="px-3 py-2">Scan date &amp; time</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((scan) => (
                  <tr key={scan.scanId} className="border-t align-top">
                    <td className="px-3 py-2 font-mono text-xs">{scan.organizerAccessCode || "-"}</td>
                    <td className="px-3 py-2">{scan.eventName}</td>
                    <td className="px-3 py-2 font-mono text-xs">{scan.ticketPublicId}</td>
                    <td className="px-3 py-2"><StatusBadge value={scan.result} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(scan.timestamp)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => setMarkTarget({ ...scan, note: "" })}>
                          Mark Suspicious
                        </button>
                        {scan.eventId ? <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${scan.eventId}`}>View Event</Link> : null}
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
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(items.length / PAGE_SIZE)), prev + 1))}
          />
        </>
      ) : null}

      <ConfirmActionModal
        open={Boolean(markTarget)}
        title="Mark Scan Suspicious"
        message={
          <span>
            <span className="block">Mark this scan as suspicious?</span>
            <input
              className="mt-2 w-full rounded border p-2 text-sm"
              placeholder="Optional note"
              value={markTarget?.note || ""}
              onChange={(event) => setMarkTarget((prev) => ({ ...(prev || {}), note: event.target.value }))}
            />
          </span>
        }
        onConfirm={markSuspicious}
        onCancel={() => setMarkTarget(null)}
        loading={markLoading}
      />
    </section>
  );
}
