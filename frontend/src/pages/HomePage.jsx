import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

const TICKET_TYPES = ["General", "VIP", "VVIP"];
const DELIVERY_METHODS = {
  PDF: "PDF",
  EMAIL_LINK: "EMAIL_LINK",
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipientEmails(rawValue) {
  const parts = String(rawValue || "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const deduped = [];
  const seen = new Set();
  for (const email of parts) {
    if (!EMAIL_PATTERN.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    deduped.push(email);
  }
  return deduped;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendSummary, setSendSummary] = useState(null);
  const [result, setResult] = useState(null);
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS.PDF);
  const [recipientEmails, setRecipientEmails] = useState("");
  const [form, setForm] = useState({
    eventName: "QR Tickets Demo Event",
    eventDateTime: "",
    eventAddress: "",
  });
  const [ticketGroups, setTicketGroups] = useState([{ ticketType: "General", ticketPrice: "0", quantity: "10" }]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onTicketGroupChange = (index, field, value) => {
    setTicketGroups((prev) =>
      prev.map((group, groupIndex) => (groupIndex === index ? { ...group, [field]: value } : group)),
    );
  };

  const getAvailableTypes = (index) => {
    const selectedByOthers = new Set(ticketGroups.filter((_, i) => i !== index).map((group) => group.ticketType));
    return TICKET_TYPES.filter((type) => type === ticketGroups[index].ticketType || !selectedByOthers.has(type));
  };

  const addMoreTicketTypes = () => {
    const selected = new Set(ticketGroups.map((group) => group.ticketType));
    const nextType = TICKET_TYPES.find((type) => !selected.has(type));
    if (!nextType) return;
    setTicketGroups((prev) => [...prev, { ticketType: nextType, ticketPrice: "0", quantity: "1" }]);
  };

  const sendLinks = async (accessCode) => {
    const emails = parseRecipientEmails(recipientEmails);
    if (!emails.length) {
      setError("Add at least one valid recipient email for Send by email.");
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

  const tryDemo = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setSendSummary(null);
    try {
      const totalQuantity = Math.max(
        1,
        ticketGroups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
      );
      const singleGroup = ticketGroups.length === 1 ? ticketGroups[0] : null;
      const payload = {
        ...form,
        ticketType: singleGroup ? singleGroup.ticketType : "Mixed",
        ticketPrice: singleGroup ? singleGroup.ticketPrice : "",
        quantity: String(totalQuantity),
      };
      const response = await api.post("/demo/events", payload);
      const created = response.data;
      setResult(created);

      if (deliveryMethod === DELIVERY_METHODS.EMAIL_LINK) {
        const emails = parseRecipientEmails(recipientEmails);
        if (emails.length) {
          const sendRes = await api.post(`/orders/${encodeURIComponent(created.accessCode)}/send-links`, {
            emails,
            baseUrl: window.location.origin,
          });
          setSendSummary(sendRes.data);
        } else {
          setError("Event created. Add recipient emails, then click Send tickets.");
        }
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not create demo event.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!result?.eventId) return;
    setError("");
    try {
      const response = await api.get(`/events/${result.eventId}/tickets.pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "tickets.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not download tickets PDF.");
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">QR Tickets</h1>
      <p className="mt-2 text-slate-600">Generate tickets in seconds and manage live entry with a scanner.</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Event name</label>
          <input className="w-full rounded border p-2" name="eventName" value={form.eventName} onChange={onChange} placeholder="Event name" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Event date and time</label>
          <input className="w-full rounded border p-2" name="eventDateTime" type="datetime-local" value={form.eventDateTime} onChange={onChange} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Event location</label>
          <input className="w-full rounded border p-2" name="eventAddress" value={form.eventAddress} onChange={onChange} placeholder="Event location" />
        </div>

        {ticketGroups.map((group, index) => (
          <div key={group.ticketType} className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Ticket types (General, VIP, VVIP)</label>
              <select
                className="w-full rounded border p-2"
                value={group.ticketType}
                onChange={(event) => onTicketGroupChange(index, "ticketType", event.target.value)}
              >
                {getAvailableTypes(index).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Ticket price</label>
              <input
                className="w-full rounded border p-2"
                type="number"
                min="0"
                value={group.ticketPrice}
                onChange={(event) => onTicketGroupChange(index, "ticketPrice", event.target.value)}
                placeholder="Ticket price"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Number of tickets</label>
              <input
                className="w-full rounded border p-2"
                type="number"
                min="1"
                value={group.quantity}
                onChange={(event) => onTicketGroupChange(index, "quantity", event.target.value)}
                placeholder="Number of tickets"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          className="rounded border px-3 py-2"
          onClick={addMoreTicketTypes}
          disabled={ticketGroups.length >= TICKET_TYPES.length}
        >
          Add more ticket types
        </button>

        <div className="rounded border p-3">
          <p className="mb-2 text-sm font-medium">Delivery method</p>
          <label className="flex items-center gap-2 text-sm">
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
              {result?.accessCode ? (
                <button
                  type="button"
                  className="mt-3 rounded bg-indigo-600 px-3 py-2 text-white"
                  onClick={() => sendLinks(result.accessCode)}
                  disabled={sending}
                >
                  {sending ? "Sending..." : "Send tickets"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <button type="button" className="mt-4 rounded bg-black px-4 py-2 text-white" onClick={tryDemo} disabled={loading || sending}>
        {loading ? "Creating..." : "Try Demo / Generate"}
      </button>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {sendSummary ? (
        <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm">
          <p>Links sent: {sendSummary.sent}</p>
          {sendSummary.failed?.length ? <p>Failed: {sendSummary.failed.length}</p> : <p>Failed: 0</p>}
        </div>
      ) : null}

      {result?.accessCode ? (
        <div className="mt-6 rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Event access code</p>
          <p className="text-3xl font-bold tracking-wider">{result.accessCode}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => navigate(`/dashboard?code=${result.accessCode}`)}>
              Go to Dashboard
            </button>
            <button className="rounded bg-green-600 px-3 py-2 text-white" onClick={() => navigate(`/scanner?code=${result.accessCode}`)}>
              Open Scanner
            </button>
            {deliveryMethod === DELIVERY_METHODS.PDF ? (
              <button className="rounded border px-3 py-2" onClick={downloadPdf}>
                Download Tickets PDF
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

