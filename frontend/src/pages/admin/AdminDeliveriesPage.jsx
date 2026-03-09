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

export default function AdminDeliveriesPage() {
  const PAGE_SIZE = 5;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [retryTarget, setRetryTarget] = useState(null);
  const [retryLoading, setRetryLoading] = useState(false);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/deliveries", {
        params: {
          search: search.trim() || undefined,
          status: status || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      setItems(response.data.items || []);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load deliveries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const retryDelivery = async () => {
    if (!retryTarget) return;
    setRetryLoading(true);
    try {
      await adminApi.post(`/deliveries/${encodeURIComponent(retryTarget.deliveryId)}/retry`);
      setRetryTarget(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Retry failed.");
    } finally {
      setRetryLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search eventName, accessCode, recipientEmail" />
        <select className="rounded border p-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
        <input className="rounded border p-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <input className="rounded border p-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </FilterBar>
      <button className="rounded border bg-white px-3 py-2 text-sm" onClick={load}>Apply Filters</button>

      {loading ? <LoadingState label="Loading deliveries..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No deliveries found." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          {items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((delivery) => (
            <article key={delivery.deliveryId} className="rounded border bg-white p-3 text-sm">
              <p className="font-semibold">{delivery.eventName}</p>
              <p className="mt-1 text-xs">Access Code: <span className="font-mono">{delivery.accessCode}</span></p>
              <p className="mt-1 text-xs">Ticket: <span className="font-mono break-all">{delivery.ticketPublicId}</span></p>
              <p className="mt-1">Recipient: {delivery.recipientEmail}</p>
              <p className="mt-1">Status: <StatusBadge value={delivery.deliveryStatus} /></p>
              <p className="mt-1">Provider Message: {delivery.providerMessage || "-"}</p>
              <p className="mt-1">Attempted: {formatDate(delivery.attemptedAt)}</p>
              <p className="mt-1">Sent: {formatDate(delivery.sentAt)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${delivery.eventId}`}>View Event</Link>
                <a className="rounded border px-2 py-1 text-xs" href={delivery.ticketUrl} target="_blank" rel="noreferrer">View Ticket</a>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(delivery.ticketUrl)}>Copy Ticket URL</button>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => setRetryTarget(delivery)}>Retry Send</button>
              </div>
            </article>
          ))}
          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(items.length / PAGE_SIZE))}
            totalItems={items.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(items.length / PAGE_SIZE)), prev + 1))}
          />
        </div>
      ) : null}

      <ConfirmActionModal
        open={Boolean(retryTarget)}
        title="Retry Delivery"
        message="Retry sending this delivery now?"
        onConfirm={retryDelivery}
        onCancel={() => setRetryTarget(null)}
        loading={retryLoading}
      />
    </section>
  );
}
