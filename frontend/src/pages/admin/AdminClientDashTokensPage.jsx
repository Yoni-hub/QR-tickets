import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import SearchInput from "../../components/admin/SearchInput";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";
import PaginationControls from "../../components/admin/PaginationControls";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminClientDashTokensPage() {
  const PAGE_SIZE = 5;
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/client-dash-tokens", {
        params: { search: search.trim() || undefined },
      });
      setItems(response.data.items || []);
      setPage(1);
    } catch (requestError) {
      const raw = requestError.response?.data;
      if (requestError.response?.status === 404) {
        try {
          const fallback = await adminApi.get("/overview");
          const rows = Array.isArray(fallback.data?.recentTicketRequests) ? fallback.data.recentTicketRequests : [];
          if (rows.length) {
            setItems(
              rows.map((row) => ({
                requestId: row.requestId,
                eventId: row.eventId,
                eventName: row.eventName,
                eventCode: row.accessCode || "-",
                buyerName: row.buyerName || "-",
                buyerEmail: row.buyerEmail || "-",
                status: row.status,
                clientAccessToken: row.clientAccessToken,
                clientDashboardUrl: row.clientDashboardUrl,
                createdAt: row.createdAt,
              })),
            );
            setPage(1);
            setError("");
            return;
          }
        } catch {
          // fall through to explicit error below
        }
        setError("Client Dash Tokens endpoint is not active on backend yet. Restart backend and reload this page.");
      } else {
        setError(raw?.error || (typeof raw === "string" ? raw : "Could not load client dashboard tokens."));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="space-y-3">
      <div className="rounded border bg-white p-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search accessCode, eventName, token, buyer email/name"
        />
        <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={load}>Search</button>
      </div>

      {loading ? <LoadingState label="Loading client dashboard tokens..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No client dashboard tokens found." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          {items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item) => (
            <article key={item.requestId} className="rounded border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{item.eventName}</p>
                <StatusBadge value={item.status} />
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Event code: <span className="font-mono">{item.eventCode}</span>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Client token: <span className="font-mono break-all">{item.clientAccessToken}</span>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Buyer: {item.buyerName || "-"} ({item.buyerEmail || "-"})
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Created: {formatDate(item.createdAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => navigator.clipboard.writeText(item.clientAccessToken)}
                >
                  Copy Token
                </button>
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => navigator.clipboard.writeText(item.eventCode)}
                >
                  Copy Event Code
                </button>
                <a
                  className="rounded border px-2 py-1 text-xs text-blue-700"
                  href={item.clientDashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Client Dashboard
                </a>
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
    </section>
  );
}
