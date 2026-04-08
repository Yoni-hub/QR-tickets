import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import StatusBadge from "../../components/admin/StatusBadge";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminEventDetailPage() {
  const { eventId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [markPaidLoading, setMarkPaidLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [autoApproveLoading, setAutoApproveLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get(`/events/${encodeURIComponent(eventId)}`);
      setData(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load event detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) load();
  }, [eventId]);

  if (loading) return <LoadingState label="Loading event detail..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState label="No event detail found." />;

  const { event, configurationSnapshot, scanSummary, deliverySummary, invoice } = data;
  const canMarkPaid = invoice && ["SENT", "OVERDUE", "PARTIAL_SEND_FAILED", "FAILED", "BLOCKED_MISSING_INSTRUCTION", "PENDING"].includes(invoice.status);
  const canRetryDelivery = invoice && ["FAILED", "PARTIAL_SEND_FAILED", "BLOCKED_MISSING_INSTRUCTION", "PENDING"].includes(invoice.status);

  const handleMarkPaid = async () => {
    if (!invoice?.id) return;
    setMarkPaidLoading(true);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/${encodeURIComponent(invoice.id)}/mark-paid`, {
        paymentNote,
      });
      setActionMessage("Invoice marked as PAID.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not mark invoice as paid.");
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const handleAddPayment = async () => {
    if (!invoice?.id) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionMessage("Enter a valid payment amount greater than 0.");
      return;
    }
    setMarkPaidLoading(true);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/${encodeURIComponent(invoice.id)}/add-payment`, {
        paymentAmount: amount,
        paymentNote,
      });
      setActionMessage("Payment recorded.");
      setPaymentAmount("");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not record payment.");
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const handleRetryDelivery = async () => {
    if (!invoice?.id) return;
    setMarkPaidLoading(true);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/${encodeURIComponent(invoice.id)}/retry-delivery`);
      setActionMessage("Invoice delivery retried.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not retry invoice delivery.");
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const handleApproveEvidence = async (evidenceId) => {
    if (!evidenceId) return;
    setMarkPaidLoading(true);
    setActionMessage("");
    try {
      await adminApi.patch(`/invoices/payment-evidence/${encodeURIComponent(evidenceId)}/approve`);
      setActionMessage("Payment evidence approved.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not approve payment evidence.");
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const handleToggleAutoApprove = async (enabled) => {
    if (!event?.eventId) return;
    setAutoApproveLoading(true);
    setActionMessage("");
    try {
      await adminApi.patch(`/events/${encodeURIComponent(event.eventId)}/invoice-evidence-auto-approve`, { enabled });
      setActionMessage(enabled ? "Auto-approve enabled for organizer." : "Auto-approve disabled for organizer.");
      await load();
    } catch (requestError) {
      setActionMessage(requestError.response?.data?.error || "Could not update auto-approve setting.");
    } finally {
      setAutoApproveLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <article className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">{event.eventName}</h2>
          <StatusBadge value={event.status} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p><span className="font-semibold">Event Date:</span> {formatDate(event.eventDate)}</p>
          <p><span className="font-semibold">Location:</span> {event.location}</p>
          <p><span className="font-semibold">Access Code:</span> <span className="font-mono">{event.accessCode}</span></p>
          <p><span className="font-semibold">Created:</span> {formatDate(event.createdAt)}</p>
          <p><span className="font-semibold">Tickets Total:</span> {event.ticketsTotal}</p>
          <p><span className="font-semibold">Scanned:</span> {event.ticketsScanned}</p>
          <p><span className="font-semibold">Remaining:</span> {event.ticketsRemaining}</p>
          <p><span className="font-semibold">Deliveries Sent:</span> {event.deliveriesSent}</p>
          <p><span className="font-semibold">Deliveries Failed:</span> {event.deliveriesFailed}</p>
          <p><span className="font-semibold">Last Scan:</span> {formatDate(event.lastScanAt)}</p>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Event Configuration Snapshot</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">Title:</span> {configurationSnapshot?.title || "-"}</p>
          <p><span className="font-semibold">Date:</span> {formatDate(configurationSnapshot?.date)}</p>
          <p><span className="font-semibold">Location:</span> {configurationSnapshot?.location || "-"}</p>
          <p><span className="font-semibold">Tickets Requested:</span> {configurationSnapshot?.ticketsRequested ?? "-"}</p>
          <p><span className="font-semibold">Default Ticket Type:</span> {configurationSnapshot?.ticketType || "-"}</p>
          <p><span className="font-semibold">Default Ticket Price:</span> {configurationSnapshot?.ticketPrice != null ? `${configurationSnapshot?.designJson?.currency || "$"}${Number(configurationSnapshot.ticketPrice).toFixed(2)}` : "Ask organizer"}</p>
          <p><span className="font-semibold">Header Image:</span> {configurationSnapshot?.hasHeaderImage ? "Yes" : "No"}</p>
        </div>
        {Array.isArray(configurationSnapshot?.designJson?.ticketGroups) && configurationSnapshot.designJson.ticketGroups.length ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold">Ticket Groups</p>
            {configurationSnapshot.designJson.ticketGroups.map((group, index) => (
              <div key={`${group.ticketType || "group"}-${index}`} className="rounded border bg-slate-50 p-2 text-xs">
                <p><span className="font-semibold">Type:</span> {group.ticketType || "-"}</p>
                <p><span className="font-semibold">Price:</span> {group.ticketPrice != null ? `${configurationSnapshot?.designJson?.currency || "$"}${Number(group.ticketPrice).toFixed(2)}` : "-"}</p>
                <p><span className="font-semibold">Header Text:</span> {group.headerText || "-"}</p>
              </div>
            ))}
          </div>
        ) : null}
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Event Scan Summary</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <p className="rounded border p-2">VALID: <span className="font-semibold">{scanSummary.VALID}</span></p>
          <p className="rounded border p-2">USED: <span className="font-semibold">{scanSummary.USED}</span></p>
          <p className="rounded border p-2">INVALID: <span className="font-semibold">{scanSummary.INVALID}</span></p>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Event Delivery Summary</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          <p className="rounded border p-2">Sent: <span className="font-semibold">{deliverySummary.sent}</span></p>
          <p className="rounded border p-2">Failed: <span className="font-semibold">{deliverySummary.failed}</span></p>
          <p className="rounded border p-2">Unknown: <span className="font-semibold">{deliverySummary.unknown}</span></p>
        </div>
      </article>

      <article className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Organizer Invoice (T-24h Snapshot)</h3>
        {!invoice ? (
          <p className="mt-2 text-sm text-slate-600">No invoice generated yet for this event.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <p><span className="font-semibold">Invoice ID:</span> <span className="font-mono text-xs">{invoice.id}</span></p>
            <p><span className="font-semibold">Status:</span> {invoice.status}</p>
            <p><span className="font-semibold">Currency:</span> {invoice.currency}</p>
            <p><span className="font-semibold">Approved Tickets:</span> {invoice.approvedTicketCount}</p>
            <p><span className="font-semibold">Unit Price:</span> {invoice.unitPrice}</p>
            <p><span className="font-semibold">Total Amount:</span> {invoice.totalAmount}</p>
            <p><span className="font-semibold">Amount Paid:</span> {invoice.amountPaid ?? "-"}</p>
            <p><span className="font-semibold">Amount Remaining:</span> {invoice.amountRemaining ?? "-"}</p>
            <p><span className="font-semibold">Generated At:</span> {formatDate(invoice.generatedAt)}</p>
            <p><span className="font-semibold">Due At:</span> {formatDate(invoice.dueAt)}</p>
            <p><span className="font-semibold">Paid At:</span> {formatDate(invoice.paidAt)}</p>
            <p><span className="font-semibold">Sent By Email:</span> {formatDate(invoice.sentByEmailAt)}</p>
            <p><span className="font-semibold">Sent By Chat:</span> {formatDate(invoice.sentByChatAt)}</p>
            <p><span className="font-semibold">Email Error:</span> {invoice.emailError || "-"}</p>
            <p><span className="font-semibold">Chat Error:</span> {invoice.chatError || "-"}</p>
            <div className="sm:col-span-2">
              <p className="font-semibold">Payment Instruction Snapshot</p>
              <pre className="mt-1 whitespace-pre-wrap rounded border bg-slate-50 p-2 text-xs">{invoice.paymentInstructionSnapshot || "-"}</pre>
            </div>
            <div className="sm:col-span-2">
              <p className="font-semibold">Payment Note</p>
              <pre className="mt-1 whitespace-pre-wrap rounded border bg-slate-50 p-2 text-xs">{invoice.paymentNote || "-"}</pre>
            </div>
            <div className="sm:col-span-2 rounded border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Organizer Payment Evidence Auto-Approve</p>
                <button
                  type="button"
                  onClick={() => handleToggleAutoApprove(!event.invoiceEvidenceAutoApprove)}
                  disabled={autoApproveLoading}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                >
                  {autoApproveLoading
                    ? "Saving..."
                    : event.invoiceEvidenceAutoApprove
                      ? "Disable Auto-Approve"
                      : "Enable Auto-Approve"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Current: {event.invoiceEvidenceAutoApprove ? "Enabled" : "Disabled"} (applies to organizer account for future evidence submissions).
              </p>
            </div>
            <div className="sm:col-span-2 rounded border bg-slate-50 p-3">
              <p className="text-sm font-semibold">Submitted Payment Evidence</p>
              {Array.isArray(invoice.paymentEvidence) && invoice.paymentEvidence.length ? (
                <div className="mt-2 space-y-2">
                  {invoice.paymentEvidence.map((evidence) => (
                    <div key={evidence.id} className="rounded border bg-white p-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p><span className="font-semibold">Status:</span> {evidence.status}</p>
                        <p><span className="font-semibold">Submitted:</span> {formatDate(evidence.submittedAt)}</p>
                      </div>
                      {evidence.note ? <p className="mt-1 text-slate-700"><span className="font-semibold">Note:</span> {evidence.note}</p> : null}
                      <a href={evidence.evidenceImageDataUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                        <img src={evidence.evidenceImageDataUrl} alt="Payment evidence" className="h-20 w-20 rounded border object-cover" />
                      </a>
                      {evidence.status === "PENDING" ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => handleApproveEvidence(evidence.id)}
                            disabled={markPaidLoading}
                            className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {markPaidLoading ? "Saving..." : "Approve Evidence & Mark Paid"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-600">No payment evidence submitted yet.</p>
              )}
            </div>
            {canMarkPaid ? (
              <div className="sm:col-span-2 rounded border bg-slate-50 p-3">
                <p className="text-sm font-semibold">Record Payment</p>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(eventValue) => setPaymentAmount(eventValue.target.value)}
                  className="mt-2 w-full rounded border px-3 py-2 text-xs"
                  placeholder="Payment amount"
                />
                <textarea
                  rows={2}
                  value={paymentNote}
                  onChange={(eventValue) => setPaymentNote(eventValue.target.value)}
                  className="mt-2 w-full rounded border px-3 py-2 text-xs"
                  placeholder="Optional payment note"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canRetryDelivery ? (
                    <button
                      type="button"
                      onClick={handleRetryDelivery}
                      disabled={markPaidLoading}
                      className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-60"
                    >
                      {markPaidLoading ? "Saving..." : "Retry Delivery"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleAddPayment}
                    disabled={markPaidLoading}
                    className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {markPaidLoading ? "Saving..." : "Add Payment"}
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkPaid}
                    disabled={markPaidLoading}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {markPaidLoading ? "Saving..." : "Mark Remaining as PAID"}
                  </button>
                  {actionMessage ? <p className="text-xs text-slate-600">{actionMessage}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </article>
    </section>
  );
}
