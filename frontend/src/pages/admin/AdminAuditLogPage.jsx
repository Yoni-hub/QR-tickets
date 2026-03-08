import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import SearchInput from "../../components/admin/SearchInput";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminAuditLogPage() {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/audit-log", {
        params: { search: search.trim() || undefined },
      });
      setItems(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load audit log.");
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
        <SearchInput value={search} onChange={setSearch} placeholder="Search action, target type, or target id" />
        <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={load}>Search</button>
      </div>

      {loading ? <LoadingState label="Loading audit log..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No audit logs yet." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          {items.map((entry) => (
            <article key={entry.logId} className="rounded border bg-white p-3 text-sm">
              <p className="font-semibold">{entry.adminAction}</p>
              <p className="mt-1 text-slate-600">{formatDate(entry.timestamp)}</p>
              <p className="mt-1">{entry.targetType} | <span className="font-mono">{entry.targetId}</span></p>
              {entry.metadata ? (
                <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs">{JSON.stringify(entry.metadata, null, 2)}</pre>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}