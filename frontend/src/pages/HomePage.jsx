import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [form, setForm] = useState({
    eventName: "QR Tickets Demo Event",
    eventDateTime: "",
    eventAddress: "",
    ticketType: "General",
    ticketPrice: "0",
    quantity: "10",
  });

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const tryDemo = async () => {
    setLoading(true);
    setError("");
    setAccessCode("");
    try {
      const response = await api.post("/demo/events", form);
      setAccessCode(response.data.accessCode);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not create demo event.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">QR Tickets</h1>
      <p className="mt-2 text-slate-600">Generate tickets in seconds and manage live entry with a scanner.</p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <input className="rounded border p-2" name="eventName" value={form.eventName} onChange={onChange} placeholder="Event name" />
        <input className="rounded border p-2" name="eventDateTime" type="datetime-local" value={form.eventDateTime} onChange={onChange} />
        <input className="rounded border p-2 md:col-span-2" name="eventAddress" value={form.eventAddress} onChange={onChange} placeholder="Event location" />
        <input className="rounded border p-2" name="ticketType" value={form.ticketType} onChange={onChange} placeholder="Ticket type (optional)" />
        <input className="rounded border p-2" name="ticketPrice" value={form.ticketPrice} onChange={onChange} placeholder="Ticket price (optional)" />
        <input className="rounded border p-2" name="quantity" type="number" min="1" value={form.quantity} onChange={onChange} placeholder="Number of tickets" />
      </div>

      <button type="button" className="mt-4 rounded bg-black px-4 py-2 text-white" onClick={tryDemo} disabled={loading}>
        {loading ? "Creating..." : "Try Demo"}
      </button>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {accessCode ? (
        <div className="mt-6 rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Event access code</p>
          <p className="text-3xl font-bold tracking-wider">{accessCode}</p>
          <div className="mt-3 flex gap-2">
            <button className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => navigate(`/dashboard?code=${accessCode}`)}>
              Go to Dashboard
            </button>
            <button className="rounded bg-green-600 px-3 py-2 text-white" onClick={() => navigate(`/scanner?code=${accessCode}`)}>
              Open Scanner
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
