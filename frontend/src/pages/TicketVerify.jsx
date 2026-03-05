import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";

export default function TicketVerify() {
  const { ticketPublicId = "" } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get(`/tickets/${encodeURIComponent(ticketPublicId)}`);
        if (alive) setTicket(response.data.ticket);
      } catch (requestError) {
        if (alive) {
          setError(requestError.response?.data?.error || "Ticket not found.");
          setTicket(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    if (ticketPublicId) {
      load();
    }

    return () => {
      alive = false;
    };
  }, [ticketPublicId]);

  if (loading) return <main className="mx-auto max-w-3xl p-6">Loading...</main>;
  if (error) return <main className="mx-auto max-w-3xl p-6 text-red-600">{error}</main>;
  if (!ticket) return <main className="mx-auto max-w-3xl p-6">Ticket not found.</main>;

  const statusClass = ticket.status === "USED" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Ticket Verification</h1>
      <div className="mt-4 rounded border bg-white p-4">
        <p><span className="font-semibold">Event:</span> {ticket.event.eventName}</p>
        <p><span className="font-semibold">Date:</span> {new Date(ticket.event.eventDate).toLocaleString()}</p>
        <p><span className="font-semibold">Location:</span> {ticket.event.eventAddress}</p>
        <p><span className="font-semibold">Ticket ID:</span> <span className="font-mono">{ticket.ticketPublicId}</span></p>
        <p className="mt-2"><span className={`rounded px-2 py-1 text-sm font-semibold ${statusClass}`}>{ticket.status}</span></p>
        {ticket.scannedAt ? <p className="mt-2"><span className="font-semibold">Scanned At:</span> {new Date(ticket.scannedAt).toLocaleString()}</p> : null}
      </div>
      <p className="mt-3 text-sm text-slate-600">This page is informational only and does not mark tickets as used.</p>
    </main>
  );
}
