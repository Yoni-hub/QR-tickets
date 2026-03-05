import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

const TICKET_TYPES = ["General", "VIP", "VVIP"];

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({
    eventName: "QR Tickets Demo Event",
    eventDateTime: "",
    eventAddress: "",
  });
  const [ticketGroups, setTicketGroups] = useState([
    { ticketType: "General", ticketPrice: "0", quantity: "10" },
  ]);

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

  const tryDemo = async () => {
    setLoading(true);
    setError("");
    setResult(null);
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
      setResult(response.data);
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
                  <option key={type} value={type}>{type}</option>
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
      </div>

      <button type="button" className="mt-4 rounded bg-black px-4 py-2 text-white" onClick={tryDemo} disabled={loading}>
        {loading ? "Creating..." : "Try Demo"}
      </button>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

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
            <button className="rounded border px-3 py-2" onClick={downloadPdf}>Download Tickets PDF</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
