import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";

const DELIVERY_METHODS = {
  PDF: "PDF",
  EMAIL_LINK: "EMAIL_LINK",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipientEmails(rawValue) {
  return String(rawValue || "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry, index, arr) => EMAIL_PATTERN.test(entry) && arr.indexOf(entry) === index);
}

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS.PDF);
  const [recipientEmails, setRecipientEmails] = useState("");
  const [sendSummary, setSendSummary] = useState(null);

  const load = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    setSendSummary(null);
    setParams({ code: code.trim() });
    try {
      const summaryRes = await api.get(`/events/by-code/${encodeURIComponent(code.trim())}`);
      setSummary(summaryRes.data);
      const ticketsRes = await api.get(`/events/${summaryRes.data.event.id}/tickets`);
      setTickets(ticketsRes.data.tickets || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load dashboard.");
      setSummary(null);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!summary?.event?.id) return;
    setError("");
    try {
      const response = await api.get(`/events/${summary.event.id}/tickets.pdf`, { responseType: "blob" });
      const contentType = String(response.headers?.["content-type"] || "");
      if (!contentType.includes("application/pdf") || response.data.size < 500) {
        const text = await response.data.text();
        throw new Error(text || "PDF generation failed.");
      }
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "tickets.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not download tickets PDF.");
    }
  };

  const sendTicketLinks = async () => {
    const accessCode = summary?.event?.accessCode || code.trim();
    if (!accessCode) return;
    const emails = parseRecipientEmails(recipientEmails);
    if (!emails.length) {
      setError("Add at least one valid recipient email.");
      return;
    }

    setSending(true);
    setError("");
    setSendSummary(null);
    try {
      const response = await api.post(`/orders/${encodeURIComponent(accessCode)}/send-links`, {
        emails,
        baseUrl: window.location.origin,
      });
      setSendSummary(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not send ticket links.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="mt-4 flex gap-2">
        <input
          className="w-64 rounded border p-2"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
        />
        <button className="rounded bg-black px-4 py-2 text-white" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {summary ? (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded border p-3"><p className="text-xs">Total</p><p className="text-2xl font-bold">{summary.totalTickets}</p></div>
            <div className="rounded border p-3"><p className="text-xs">Scanned</p><p className="text-2xl font-bold">{summary.scannedTickets}</p></div>
            <div className="rounded border p-3"><p className="text-xs">Remaining</p><p className="text-2xl font-bold">{summary.remainingTickets}</p></div>
          </div>

          <div className="mt-4 rounded border p-4">
            <p><span className="font-semibold">Event:</span> {summary.event.eventName}</p>
            <p><span className="font-semibold">Date:</span> {new Date(summary.event.eventDate).toLocaleString()}</p>
            <p><span className="font-semibold">Location:</span> {summary.event.eventAddress}</p>
          </div>

          <div className="mt-4 rounded border p-4">
            <p className="text-sm font-semibold">Delivery method</p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="deliveryMethod"
                value={DELIVERY_METHODS.PDF}
                checked={deliveryMethod === DELIVERY_METHODS.PDF}
                onChange={(event) => setDeliveryMethod(event.target.value)}
              />
              <span>Download PDF</span>
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="deliveryMethod"
                value={DELIVERY_METHODS.EMAIL_LINK}
                checked={deliveryMethod === DELIVERY_METHODS.EMAIL_LINK}
                onChange={(event) => setDeliveryMethod(event.target.value)}
              />
              <span>Send by email (links)</span>
            </label>

            {deliveryMethod === DELIVERY_METHODS.PDF ? (
              <button className="mt-3 rounded border px-3 py-2" onClick={downloadPdf}>
                Download Tickets PDF
              </button>
            ) : null}

            {deliveryMethod === DELIVERY_METHODS.EMAIL_LINK ? (
              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium">Recipient emails</label>
                <textarea
                  className="w-full rounded border p-2"
                  rows={4}
                  value={recipientEmails}
                  onChange={(event) => setRecipientEmails(event.target.value)}
                  placeholder="alice@email.com, bob@email.com"
                />
                <p className="mt-1 text-xs text-slate-600">We&apos;ll send one ticket link per email.</p>
                <button className="mt-3 rounded bg-indigo-600 px-3 py-2 text-white" onClick={sendTicketLinks} disabled={sending}>
                  {sending ? "Sending..." : "Send tickets"}
                </button>
              </div>
            ) : null}
          </div>

          {sendSummary ? (
            <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm">
              <p>Links sent: {sendSummary.sent}</p>
              <p>Failed: {sendSummary.failed?.length || 0}</p>
            </div>
          ) : null}

          <div className="mt-5 overflow-x-auto rounded border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2">ticketPublicId</th><th className="p-2">status</th><th className="p-2">scannedAt</th></tr></thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.ticketPublicId} className="border-t">
                    <td className="p-2 font-mono">{ticket.ticketPublicId}</td>
                    <td className="p-2">{ticket.status}</td>
                    <td className="p-2">{ticket.scannedAt ? new Date(ticket.scannedAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </main>
  );
}
