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

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminScansPage() {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
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
      setItems(response.data.items || []);
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

  return (
    <section className="space-y-3">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search eventName, accessCode, ticketPublicId" />
        <select className="rounded border p-2 text-sm" value={result} onChange={(event) => setResult(event.target.value)}>
          <option value="">All results</option>
          <option value="VALID">VALID</option>
          <option value="USED">USED</option>
          <option value="INVALID">INVALID</option>
        </select>
        <input className="rounded border p-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <input className="rounded border p-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </FilterBar>
      <button className="rounded border bg-white px-3 py-2 text-sm" onClick={load}>Apply Filters</button>

      {loading ? <LoadingState label="Loading scans..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No scans found." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          {items.map((scan) => (
            <article key={scan.scanId} className="rounded border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{scan.eventName}</p>
                <StatusBadge value={scan.result} />
              </div>
              <p className="mt-1">Timestamp: {formatDate(scan.timestamp)}</p>
              <p className="mt-1">Access Code: <span className="font-mono">{scan.accessCode}</span></p>
              <p className="mt-1">ticketPublicId: <span className="font-mono break-all">{scan.ticketPublicId}</span></p>
              <p className="mt-1">rawScannedValue: <span className="font-mono break-all">{scan.rawScannedValue || "-"}</span></p>
              <p className="mt-1">parsedValue: <span className="font-mono break-all">{scan.parsedValue || "-"}</span></p>
              <p className="mt-1">scannerSource: {scan.scannerSource || "-"}</p>
              <p className="mt-1">attendeeEmail: {scan.attendeeEmail || "-"}</p>
              <p className="mt-1">note: {scan.note || "-"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${scan.eventId}`}>View Event</Link>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(scan.ticketPublicId || "")}>Copy Ticket ID</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setMarkTarget({ ...scan, note: "" })}>Mark Suspicious</button>
              </div>
            </article>
          ))}
        </div>
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