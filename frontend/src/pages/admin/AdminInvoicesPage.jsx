import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";
import ModalOverlay from "../../components/ui/ModalOverlay";

const FILTERS = [
  { id: "ALL", label: "ALL" },
  { id: "OVERDUE", label: "OVERDUE" },
  { id: "UNPAID", label: "UNPAID" },
  { id: "BLOCKED", label: "BLOCKED" },
];

const AUTO_APPROVE_FILTERS = [
  { id: "ALL", label: "Auto-Approve: ALL" },
  { id: "ON", label: "Auto-Approve: ON" },
  { id: "OFF", label: "Auto-Approve: OFF" },
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
  const [meta, setMeta] = useState({ autoApproveEnabledCount: 0, autoApproveDisabledCount: 0 });
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [autoApproveFilter, setAutoApproveFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [organizerAccessCode, setOrganizerAccessCode] = useState("");
  const [eventDateFrom, setEventDateFrom] = useState("");
  const [eventDateTo, setEventDateTo] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [paymentInputByInvoice, setPaymentInputByInvoice] = useState({});
  const [evidencePreview, setEvidencePreview] = useState("");

  const [selectedEventByOrganizer, setSelectedEventByOrganizer] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/invoices", {
        params: {
          statusFilter: activeFilter,
          autoApprove: autoApproveFilter,
          search: search || undefined,
          organizerEmail: organizerEmail || undefined,
          organizerAccessCode: organizerAccessCode || undefined,
          eventDateFrom: eventDateFrom || undefined,
          eventDateTo: eventDateTo || undefined,
        },
      });
      const nextItems = Array.isArray(response.data?.items) ? response.data.items : [];
      const nextSelections = {};
      const grouped = new Map();
      for (const invoice of nextItems) {
        const organizerCode = String(invoice.organizerAccessCode || invoice.eventAccessCode || "UNKNOWN").trim();
        if (!grouped.has(organizerCode)) grouped.set(organizerCode, []);
        grouped.get(organizerCode).push(invoice);
      }
      for (const [organizerCode, organizerInvoices] of grouped.entries()) {
        const firstInvoice = organizerInvoices[0];
        nextSelections[organizerCode] = firstInvoice?.eventId || "";
      }
      setSelectedEventByOrganizer(nextSelections);
      setItems(nextItems);
      setMeta({
        autoApproveEnabledCount: Number(response.data?.meta?.autoApproveEnabledCount || 0),
        autoApproveDisabledCount: Number(response.data?.meta?.autoApproveDisabledCount || 0),
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeFilter, autoApproveFilter, refreshTick]);

  const applySearchFilters = () => setRefreshTick((value) => value + 1);

  const resetSearchFilters = () => {
    setSearch("");
    setOrganizerEmail("");
    setOrganizerAccessCode("");
    setEventDateFrom("");
    setEventDateTo("");
    setRefreshTick((value) => value + 1);
  };

  const approveEvidence = async (evidenceId) => {
    if (!evidenceId) return;
    setActionLoading(`approve:${evidenceId}`);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/payment-evidence/${encodeURIComponent(evidenceId)}/approve`);
      setActionMessage("Payment evidence approved.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not approve payment evidence.");
    } finally {
      setActionLoading("");
    }
  };

  const toggleRowAutoApprove = async (eventId, enabled) => {
    if (!eventId) return;
    setActionLoading(`row-auto:${eventId}`);
    setActionMessage("");
    try {
      await adminApi.patch(`/events/${encodeURIComponent(eventId)}/invoice-evidence-auto-approve`, { enabled });
      setActionMessage(enabled ? "Auto-approve enabled for organizer." : "Auto-approve disabled for organizer.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not update organizer auto-approve.");
    } finally {
      setActionLoading("");
    }
  };

  const toggleGlobalAutoApprove = async (enabled) => {
    setActionLoading("global-auto");
    setActionMessage("");
    try {
      await adminApi.patch("/events/invoice-evidence-auto-approve-all", { enabled });
      setActionMessage(enabled ? "Global auto-approve enabled for all organizers." : "Global auto-approve disabled for all organizers.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not update global auto-approve.");
    } finally {
      setActionLoading("");
    }
  };

  const addPayment = async (invoiceId) => {
    const raw = String(paymentInputByInvoice[invoiceId] || "").trim();
    const paymentAmount = Number(raw);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setActionMessage("Enter a valid payment amount greater than 0.");
      return;
    }
    setActionLoading(`add-payment:${invoiceId}`);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/${encodeURIComponent(invoiceId)}/add-payment`, { paymentAmount });
      setPaymentInputByInvoice((prev) => ({ ...prev, [invoiceId]: "" }));
      setActionMessage("Payment added.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not add payment.");
    } finally {
      setActionLoading("");
    }
  };

  const sendInvoice = async (invoiceId) => {
    if (!invoiceId) return;
    setActionLoading(`send:${invoiceId}`);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/${encodeURIComponent(invoiceId)}/retry-delivery`);
      setActionMessage("Invoice send triggered.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not send invoice.");
    } finally {
      setActionLoading("");
    }
  };

  const allowEvidenceAttachment = async (invoiceId) => {
    if (!invoiceId) return;
    setActionLoading(`allow-attachment:${invoiceId}`);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/${encodeURIComponent(invoiceId)}/allow-evidence-attachment`);
      setActionMessage("Attachment allowed for one new organizer upload.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not allow attachment.");
    } finally {
      setActionLoading("");
    }
  };

  const groupedRows = useMemo(() => {
    const organizerMap = new Map();
    for (const invoice of items) {
      const organizerCode = String(invoice.organizerAccessCode || invoice.eventAccessCode || "UNKNOWN").trim();
      if (!organizerMap.has(organizerCode)) {
        organizerMap.set(organizerCode, {
          organizerAccessCode: organizerCode || "-",
          organizerName: invoice.organizerName || "-",
          organizerEmail: invoice.organizerEmail || "-",
          eventMap: new Map(),
        });
      }
      const row = organizerMap.get(organizerCode);
      if (!row.eventMap.has(invoice.eventId)) {
        row.eventMap.set(invoice.eventId, {
          eventId: invoice.eventId,
          eventName: invoice.eventName || "-",
          invoices: [],
        });
      }
      row.eventMap.get(invoice.eventId).invoices.push(invoice);
    }

    return Array.from(organizerMap.values()).map((row) => {
      const events = Array.from(row.eventMap.values()).map((event) => ({
        ...event,
        invoices: event.invoices.sort((a, b) => new Date(b.invoiceDateTime).getTime() - new Date(a.invoiceDateTime).getTime()),
      }));
      const selectedEventId = selectedEventByOrganizer[row.organizerAccessCode] || events[0]?.eventId || "";
      const selectedEvent = events.find((event) => event.eventId === selectedEventId) || events[0] || null;
      const selectedInvoice = (selectedEvent?.invoices || [])[0] || null;
      return {
        organizerAccessCode: row.organizerAccessCode,
        organizerName: row.organizerName,
        organizerEmail: row.organizerEmail,
        events,
        selectedEventId,
        selectedEvent,
        selectedInvoice,
      };
    });
  }, [items, selectedEventByOrganizer]);

  return (
    <section className="space-y-3">
      <article className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Organizer Invoices</h2>
        <p className="mt-1 text-xs text-slate-500">
          Grouped by organizer access code. Choose event name to switch invoice details.
        </p>

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

        <div className="mt-2 flex flex-wrap gap-2">
          {AUTO_APPROVE_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAutoApproveFilter(item.id)}
              className={`rounded border px-3 py-1 text-xs font-semibold ${
                autoApproveFilter === item.id ? "bg-slate-900 text-white" : "bg-white text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded border px-3 py-2 text-xs"
            placeholder="Search event/organizer/email/access code"
          />
          <input
            type="text"
            value={organizerEmail}
            onChange={(event) => setOrganizerEmail(event.target.value)}
            className="rounded border px-3 py-2 text-xs"
            placeholder="Filter organizer email"
          />
          <input
            type="text"
            value={organizerAccessCode}
            onChange={(event) => setOrganizerAccessCode(event.target.value)}
            className="rounded border px-3 py-2 text-xs"
            placeholder="Filter organizer access code"
          />
          <input
            type="date"
            value={eventDateFrom}
            onChange={(event) => setEventDateFrom(event.target.value)}
            className="rounded border px-3 py-2 text-xs"
          />
          <input
            type="date"
            value={eventDateTo}
            onChange={(event) => setEventDateTo(event.target.value)}
            className="rounded border px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button type="button" onClick={applySearchFilters} className="rounded border bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
              Search
            </button>
            <button type="button" onClick={resetSearchFilters} className="rounded border bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              Reset
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>Auto-approve ON: {meta.autoApproveEnabledCount}</span>
          <span>Auto-approve OFF: {meta.autoApproveDisabledCount}</span>
          <button
            type="button"
            onClick={() => toggleGlobalAutoApprove(true)}
            disabled={actionLoading === "global-auto"}
            className="rounded border bg-emerald-700 px-3 py-1 font-semibold text-white disabled:opacity-60"
          >
            {actionLoading === "global-auto" ? "Saving..." : "Enable Auto-Approve All"}
          </button>
          <button
            type="button"
            onClick={() => toggleGlobalAutoApprove(false)}
            disabled={actionLoading === "global-auto"}
            className="rounded border bg-white px-3 py-1 font-semibold text-slate-700 disabled:opacity-60"
          >
            {actionLoading === "global-auto" ? "Saving..." : "Disable Auto-Approve All"}
          </button>
        </div>

        {actionMessage ? <p className="mt-2 text-xs text-slate-700">{actionMessage}</p> : null}
      </article>

      {loading ? <LoadingState label="Loading invoices..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && !groupedRows.length ? <EmptyState label="No invoices found for current filters." /> : null}

      {!loading && !error && groupedRows.length ? (
        <article className="rounded border bg-white">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Organizer access code</th>
                  <th className="px-3 py-2">Organizer name</th>
                  <th className="px-3 py-2">Organizer email</th>
                  <th className="px-3 py-2">Event name</th>
                  <th className="px-3 py-2">Invoice number</th>
                  <th className="px-3 py-2">Invoice date</th>
                  <th className="px-3 py-2">Sold tickets</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Add Payment</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((row) => {
                  const invoice = row.selectedInvoice;
                  if (!invoice) return null;
                  return (
                    <tr key={row.organizerAccessCode} className="border-t align-top">
                      <td className="px-3 py-2 font-mono text-xs">{row.organizerAccessCode || "-"}</td>
                      <td className="px-3 py-2">{row.organizerName || "-"}</td>
                      <td className="px-3 py-2">{row.organizerEmail || "-"}</td>
                      <td className="px-3 py-2 min-w-[220px]">
                        <select
                          className="w-full rounded border p-2 text-sm"
                          value={row.selectedEventId}
                          onChange={(event) =>
                            setSelectedEventByOrganizer((prev) => ({
                              ...prev,
                              [row.organizerAccessCode]: event.target.value,
                            }))
                          }
                        >
                          {row.events.map((eventOption) => (
                            <option key={eventOption.eventId} value={eventOption.eventId}>
                            {eventOption.eventName}
                          </option>
                        ))}
                      </select>
                    </td>
                      <td className="px-3 py-2 font-mono text-xs">{invoice.invoiceNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(invoice.invoiceDateTime)}</td>
                      <td className="px-3 py-2">{invoice.soldTickets ?? 0}</td>
                      <td className="px-3 py-2">{formatMoney(invoice.currency, invoice.totalAmount)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(invoice.dueAt)}</td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={paymentInputByInvoice[invoice.invoiceId] || ""}
                            onChange={(event) =>
                              setPaymentInputByInvoice((prev) => ({
                                ...prev,
                                [invoice.invoiceId]: event.target.value,
                              }))
                            }
                            className="w-24 rounded border px-2 py-1 text-xs"
                            placeholder="Amount"
                          />
                          <button
                            type="button"
                            onClick={() => addPayment(invoice.invoiceId)}
                            disabled={actionLoading === `add-payment:${invoice.invoiceId}`}
                            className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                          >
                            {actionLoading === `add-payment:${invoice.invoiceId}` ? "Saving..." : "Add"}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2"><StatusBadge value={invoice.status} /></td>
                      <td className="px-3 py-2">
                        {invoice.latestEvidenceImageDataUrl || invoice.firstPendingPaymentEvidenceImageDataUrl ? (
                          <button
                            type="button"
                            onClick={() => setEvidencePreview(invoice.latestEvidenceImageDataUrl || invoice.firstPendingPaymentEvidenceImageDataUrl)}
                          >
                            <img
                              src={invoice.latestEvidenceImageDataUrl || invoice.firstPendingPaymentEvidenceImageDataUrl}
                              alt="Payment evidence"
                              className="h-12 w-12 rounded border object-cover"
                            />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => invoice.firstPendingPaymentEvidenceId && approveEvidence(invoice.firstPendingPaymentEvidenceId)}
                            disabled={!invoice.firstPendingPaymentEvidenceId || actionLoading === `approve:${invoice.firstPendingPaymentEvidenceId}`}
                            className="rounded border bg-emerald-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {actionLoading === `approve:${invoice.firstPendingPaymentEvidenceId}` ? "Saving..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRowAutoApprove(invoice.eventId, !invoice.invoiceEvidenceAutoApprove)}
                            disabled={actionLoading === `row-auto:${invoice.eventId}`}
                            className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                          >
                            {actionLoading === `row-auto:${invoice.eventId}` ? "Saving..." : invoice.invoiceEvidenceAutoApprove ? "Auto ON" : "Auto OFF"}
                          </button>
                          <button
                            type="button"
                            onClick={() => sendInvoice(invoice.invoiceId)}
                            disabled={!["FAILED", "PARTIAL_SEND_FAILED", "BLOCKED_MISSING_INSTRUCTION", "PENDING"].includes(invoice.status) || actionLoading === `send:${invoice.invoiceId}`}
                            className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                          >
                            {actionLoading === `send:${invoice.invoiceId}` ? "Sending..." : "Retry delivery"}
                          </button>
                          <button
                            type="button"
                            onClick={() => allowEvidenceAttachment(invoice.invoiceId)}
                            disabled={invoice.canUploadEvidence || actionLoading === `allow-attachment:${invoice.invoiceId}`}
                            className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                          >
                            {actionLoading === `allow-attachment:${invoice.invoiceId}`
                              ? "Saving..."
                              : invoice.canUploadEvidence
                                ? "Attachment allowed"
                                : "Allow attachment"}
                          </button>
                          <div className="w-full text-[11px] text-slate-500">
                            Email: {invoice.sentByEmailAt ? "Sent" : "Not sent"} | Chat: {invoice.sentByChatAt ? "Sent" : "Not sent"}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 p-2 md:hidden">
            {groupedRows.map((row) => {
              const invoice = row.selectedInvoice;
              if (!invoice) return null;
              return (
                <article key={row.organizerAccessCode} className="rounded border p-3 text-sm">
                  <p className="text-xs text-slate-500">Organizer access code</p>
                  <p className="font-mono">{row.organizerAccessCode || "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">Event name</p>
                  <select
                    className="w-full rounded border p-2 text-sm"
                    value={row.selectedEventId}
                    onChange={(event) =>
                      setSelectedEventByOrganizer((prev) => ({
                        ...prev,
                        [row.organizerAccessCode]: event.target.value,
                      }))
                    }
                  >
                    {row.events.map((eventOption) => (
                      <option key={eventOption.eventId} value={eventOption.eventId}>
                      {eventOption.eventName}
                    </option>
                  ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Invoice number</p>
                  <p className="font-mono text-xs">{invoice.invoiceNumber}</p>
                  <p className="mt-1 text-xs text-slate-500">Status</p>
                  <StatusBadge value={invoice.status} />
                  <p className="mt-1 text-xs text-slate-500">Amount</p>
                  <p>{formatMoney(invoice.currency, invoice.totalAmount)}</p>
                  <p className="mt-1 text-xs text-slate-500">Due</p>
                  <p>{formatDate(invoice.dueAt)}</p>
                  <p className="mt-1 text-xs text-slate-500">Add payment</p>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={paymentInputByInvoice[invoice.invoiceId] || ""}
                      onChange={(event) =>
                        setPaymentInputByInvoice((prev) => ({
                          ...prev,
                          [invoice.invoiceId]: event.target.value,
                        }))
                      }
                      className="w-28 rounded border px-2 py-1 text-xs"
                      placeholder="Amount"
                    />
                    <button
                      type="button"
                      onClick={() => addPayment(invoice.invoiceId)}
                      disabled={actionLoading === `add-payment:${invoice.invoiceId}`}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                    >
                      {actionLoading === `add-payment:${invoice.invoiceId}` ? "Saving..." : "Add"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Evidence</p>
                  {invoice.latestEvidenceImageDataUrl || invoice.firstPendingPaymentEvidenceImageDataUrl ? (
                    <button
                      type="button"
                      onClick={() => setEvidencePreview(invoice.latestEvidenceImageDataUrl || invoice.firstPendingPaymentEvidenceImageDataUrl)}
                    >
                      <img
                        src={invoice.latestEvidenceImageDataUrl || invoice.firstPendingPaymentEvidenceImageDataUrl}
                        alt="Payment evidence"
                        className="h-16 w-16 rounded border object-cover"
                      />
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500">-</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => invoice.firstPendingPaymentEvidenceId && approveEvidence(invoice.firstPendingPaymentEvidenceId)}
                      disabled={!invoice.firstPendingPaymentEvidenceId || actionLoading === `approve:${invoice.firstPendingPaymentEvidenceId}`}
                      className="rounded border bg-emerald-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {actionLoading === `approve:${invoice.firstPendingPaymentEvidenceId}` ? "Saving..." : "Approve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRowAutoApprove(invoice.eventId, !invoice.invoiceEvidenceAutoApprove)}
                      disabled={actionLoading === `row-auto:${invoice.eventId}`}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                    >
                      {actionLoading === `row-auto:${invoice.eventId}` ? "Saving..." : invoice.invoiceEvidenceAutoApprove ? "Auto ON" : "Auto OFF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => sendInvoice(invoice.invoiceId)}
                      disabled={!["FAILED", "PARTIAL_SEND_FAILED", "BLOCKED_MISSING_INSTRUCTION", "PENDING"].includes(invoice.status) || actionLoading === `send:${invoice.invoiceId}`}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                    >
                      {actionLoading === `send:${invoice.invoiceId}` ? "Sending..." : "Retry delivery"}
                    </button>
                    <button
                      type="button"
                      onClick={() => allowEvidenceAttachment(invoice.invoiceId)}
                      disabled={invoice.canUploadEvidence || actionLoading === `allow-attachment:${invoice.invoiceId}`}
                      className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                    >
                      {actionLoading === `allow-attachment:${invoice.invoiceId}`
                        ? "Saving..."
                        : invoice.canUploadEvidence
                          ? "Attachment allowed"
                          : "Allow attachment"}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Email: {invoice.sentByEmailAt ? "Sent" : "Not sent"} | Chat: {invoice.sentByChatAt ? "Sent" : "Not sent"}
                  </p>
                </article>
              );
            })}
          </div>
        </article>
      ) : null}

      {evidencePreview ? (
        <ModalOverlay>
          <section className="w-full max-w-2xl rounded border bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Payment evidence</p>
              <button type="button" className="rounded border px-3 py-1 text-xs" onClick={() => setEvidencePreview("")}>
                Close
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center rounded border bg-slate-50 p-2">
              <img src={evidencePreview} alt="Payment evidence" className="max-h-[74vh] w-auto rounded bg-white" />
            </div>
          </section>
        </ModalOverlay>
      ) : null}
    </section>
  );
}
