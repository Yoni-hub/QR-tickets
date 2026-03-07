import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";

function resolveStatus(ticket, order) {
  if (!order || order.status !== "ACTIVE") return "DISABLED";
  if (ticket.status === "USED") return "ALREADY_USED";
  return "VALID";
}

export default function TicketVerify() {
  const { ticketPublicId = "" } = useParams();
  const [ticket, setTicket] = useState(null);
  const [order, setOrder] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get(`/tickets/public/${encodeURIComponent(ticketPublicId)}`);
        if (alive) {
          setTicket(response.data.ticket);
          setOrder(response.data.order || null);
        }
      } catch (requestError) {
        if (alive) {
          setError(requestError.response?.data?.error || "Ticket not found.");
          setTicket(null);
          setOrder(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    if (ticketPublicId) load();
    return () => {
      alive = false;
    };
  }, [ticketPublicId]);

  const resolvedStatus = useMemo(() => {
    if (!ticket) return "DISABLED";
    return resolveStatus(ticket, order);
  }, [ticket, order]);

  if (loading) return <main className="mx-auto max-w-3xl p-6">Loading...</main>;
  if (error) return <main className="mx-auto max-w-3xl p-6 text-red-600">{error}</main>;
  if (!ticket) return <main className="mx-auto max-w-3xl p-6">Ticket not found.</main>;

  const statusLabel =
    resolvedStatus === "VALID"
      ? "valid"
      : resolvedStatus === "ALREADY_USED"
        ? "already used"
        : "disabled";
  const statusClass =
    resolvedStatus === "VALID"
      ? "bg-green-100 text-green-800"
      : resolvedStatus === "ALREADY_USED"
        ? "bg-yellow-100 text-yellow-900"
        : "bg-red-100 text-red-800";

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
    ticket.qrPayload || `${window.location.origin}/t/${ticket.ticketPublicId}`,
  )}`;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Ticket Preview</h1>
      <div className="mt-4 rounded border bg-white p-4">
        <p>
          <span className="font-semibold">Event:</span> {ticket.event.eventName}
        </p>
        <p>
          <span className="font-semibold">Date:</span> {new Date(ticket.event.eventDate).toLocaleString()}
        </p>
        <p>
          <span className="font-semibold">Location:</span> {ticket.event.eventAddress}
        </p>
        <p>
          <span className="font-semibold">Ticket ID:</span> <span className="font-mono">{ticket.ticketPublicId}</span>
        </p>
        <p className="mt-3">
          <span className={`rounded px-2 py-1 text-sm font-semibold ${statusClass}`}>{statusLabel}</span>
        </p>
        {ticket.scannedAt ? (
          <p className="mt-2">
            <span className="font-semibold">Scanned At:</span> {new Date(ticket.scannedAt).toLocaleString()}
          </p>
        ) : null}

        <AppButton
          type="button"
          className="mt-4"
          onClick={() => setShowQr((prev) => !prev)}
        >
          {showQr ? "Hide QR" : "Show QR"}
        </AppButton>

        {showQr ? (
          <div className="mt-4 w-fit rounded border p-3">
            <img src={qrImageUrl} alt="Ticket QR" width={260} height={260} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
