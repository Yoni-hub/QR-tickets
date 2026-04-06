import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";

const FILTERS = [
  { id: "ALL", label: "ALL" },
  { id: "OVERDUE", label: "OVERDUE" },
  { id: "UNPAID", label: "UNPAID" },
  { id: "BLOCKED", label: "BLOCKED" },
];

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatMoney(currency, value) {
  const amount = Number(value || 0).toFixed(2);
  return `${currency} ${amount}`;
}

export default function AdminInvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");

  const load = async (nextFilter = activeFilter) => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/invoices", {
        params: {
          statusFilter: nextFilter,
        },
      });
      setItems(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(activeFilter);
  }, [activeFilter]);

  return (
    <section className="space-y-3">
      <article className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Organizer Invoices</h2>
        <p className="mt-1 text-xs text-slate-500">Operational invoice overview for payment follow-up.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((filterItem) => (
            <button
              key={filterItem.id}
              type="button"
              onClick={() => setActiveFilter(filterItem.id)}
              className={`rounded border px-3 py-1 text-xs font-semibold ${
                activeFilter === filterItem.id ? "bg-slate-900 text-white" : "bg-white text-slate-700"
              }`}
            >
              {filterItem.label}
            </button>
          ))}
        </div>
      </article>

      {loading ? <LoadingState label="Loading invoices..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No invoices found for current filter." /> : null}

      {!loading && !error && items.length ? (
        <>
          <article className="space-y-2 md:hidden">
            {items.map((invoice) => (
              <div key={invoice.invoiceId} className="rounded border bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{invoice.eventName}</p>
                  <StatusBadge value={invoice.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{invoice.organizerEmail || "-"}</p>
                <p className="text-xs text-slate-500">Type: {invoice.invoiceType}</p>
                <p className="mt-2"><span className="font-semibold">Amount:</span> {formatMoney(invoice.currency, invoice.totalAmount)}</p>
                <p><span className="font-semibold">Remaining:</span> {formatMoney(invoice.currency, invoice.amountRemaining)}</p>
                <p><span className="font-semibold">Due:</span> {formatDate(invoice.dueAt)}</p>
                <p><span className="font-semibold">Paid:</span> {formatDate(invoice.paidAt)}</p>
                <div className="mt-2">
                  <Link className="rounded border px-2 py-1 text-xs" to={`/admin/events/${invoice.eventId}`}>View Event</Link>
                </div>
              </div>
            ))}
          </article>

          <article className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Organizer Email</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Paid At</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((invoice) => (
                  <tr key={invoice.invoiceId} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{invoice.eventName}</p>
                      <p className="text-xs text-slate-500">{formatDate(invoice.eventDate)}</p>
                    </td>
                    <td className="px-3 py-2">{invoice.invoiceType}</td>
                    <td className="px-3 py-2">{invoice.organizerEmail || "-"}</td>
                    <td className="px-3 py-2 font-medium">{formatMoney(invoice.currency, invoice.totalAmount)}</td>
                    <td className="px-3 py-2">{formatMoney(invoice.currency, invoice.amountRemaining)}</td>
                    <td className="px-3 py-2"><StatusBadge value={invoice.status} /></td>
                    <td className="px-3 py-2">{formatDate(invoice.dueAt)}</td>
                    <td className="px-3 py-2">{formatDate(invoice.paidAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link className="rounded border px-2 py-1 text-xs hover:bg-slate-50" to={`/admin/events/${invoice.eventId}`}>View Event</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </>
      ) : null}
    </section>
  );
}
