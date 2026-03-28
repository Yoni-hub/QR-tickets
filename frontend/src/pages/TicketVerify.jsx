import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";

function resolveStatus(ticket, order) {
  if (!order || order.status !== "ACTIVE") return "DISABLED";
  if (ticket.cancelledAt || ticket.isInvalidated) return "CANCELLED";
  if (ticket.status === "USED") return "ALREADY_USED";
  const expiryDate = ticket.event?.eventEndDate || ticket.event?.eventDate;
  if (expiryDate && new Date() > new Date(expiryDate)) return "EXPIRED";
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

  if (loading) return <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">Loading...</main>;
  if (error) return <main className="mx-auto w-full max-w-3xl px-4 py-4 text-red-600 sm:px-6 sm:py-6">{error}</main>;
  if (!ticket) return <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">Ticket not found.</main>;

  const statusLabel =
    resolvedStatus === "VALID"
      ? "Valid"
      : resolvedStatus === "ALREADY_USED"
        ? "Already Used"
        : resolvedStatus === "CANCELLED"
          ? "Cancelled"
          : resolvedStatus === "EXPIRED"
            ? "Expired"
            : "Disabled";
  const statusClass =
    resolvedStatus === "VALID"
      ? "bg-green-100 text-green-800"
      : resolvedStatus === "ALREADY_USED"
        ? "bg-yellow-100 text-yellow-900"
        : resolvedStatus === "CANCELLED"
          ? "bg-red-100 text-red-800"
          : resolvedStatus === "EXPIRED"
            ? "bg-orange-100 text-orange-800"
            : "bg-slate-100 text-slate-600";

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
    ticket.qrPayload || `${window.location.origin}/t/${ticket.ticketPublicId}`,
  )}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Ticket Preview</h1>
      <div className="mt-4 rounded border bg-white p-4">
        <p className="break-words">
          <span className="font-semibold">Event:</span> {ticket.event.eventName}
        </p>
        <p className="break-words">
          <span className="font-semibold">Date:</span> {new Date(ticket.event.eventDate).toLocaleString()}{ticket.event.eventEndDate ? ` — ${new Date(ticket.event.eventEndDate).toLocaleString()}` : ""}
        </p>
        <p className="break-words">
          <span className="font-semibold">Location:</span> {ticket.event.eventAddress}
        </p>
        <p className="break-words">
          <span className="font-semibold">Type:</span> {ticket.ticketType || "General"}
        </p>
        <p className="break-words">
          <span className="font-semibold">Price:</span> {ticket.designJson?.priceText || (ticket.ticketPrice != null ? `${ticket.designJson?.currency || "$"}${Number(ticket.ticketPrice).toFixed(2)}` : "Free")}
        </p>
        <p className="break-all">
          <span className="font-semibold">Ticket ID:</span> <span className="font-mono">{ticket.ticketPublicId}</span>
        </p>
        <p className="mt-3">
          <span className={`rounded px-2 py-1 text-sm font-semibold ${statusClass}`}>{statusLabel}</span>
        </p>
        {ticket.cancelledAt ? (
          <p className="mt-2 text-sm text-slate-600">
            <span className="font-semibold">Cancelled:</span> {new Date(ticket.cancelledAt).toLocaleString()}
            {ticket.cancellationReason ? ` — ${ticket.cancellationReason === "EVENT_CANCELLED" ? "Event cancelled" : ticket.cancellationReason === "PAYMENT_REFUNDED_TO_CUSTOMER" ? "Payment refunded" : ticket.cancellationOtherReason || "Other"}` : ""}
          </p>
        ) : null}
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
          <div className="mt-4 w-full rounded border p-3">
            <img src={qrImageUrl} alt="Ticket QR" width={260} height={260} className="mx-auto w-full max-w-[260px]" />
          </div>
        ) : null}
      </div>
    </main>
  );
}
