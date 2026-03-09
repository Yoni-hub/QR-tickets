import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatPrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  if (parsed <= 0) return "FREE";
  return `$${parsed.toFixed(2)}`;
}

function resolveSelectionLabel(request) {
  const selections = Array.isArray(request?.ticketSelections) ? request.ticketSelections : [];
  if (selections.length) {
    return selections
      .map((item) => `${item.ticketType || "General"} x${Number(item.quantity || 0)}`)
      .join(", ");
  }
  if (request?.ticketType && request?.quantity) {
    return `${request.ticketType} x${request.quantity}`;
  }
  return "-";
}

export default function ClientDashboardPage() {
  const { clientAccessToken: routeToken = "" } = useParams();
  const [tokenInput, setTokenInput] = useState(routeToken);
  const [loading, setLoading] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });

  const normalizedToken = useMemo(() => String(routeToken || "").trim(), [routeToken]);

  const load = async (token) => {
    const nextToken = String(token || "").trim();
    if (!nextToken || loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.get(`/public/client-dashboard/${encodeURIComponent(nextToken)}`);
      setRequestData(response.data);
      setFeedback({ kind: "success", message: "Client dashboard loaded." });
    } catch (requestError) {
      setRequestData(null);
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || "Could not load client dashboard.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (normalizedToken) {
      setTokenInput(normalizedToken);
      load(normalizedToken);
    }
  }, [normalizedToken]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Client Dashboard</h1>
      <p className="mt-1 text-sm text-slate-600">Track your request status and view approved tickets.</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded border p-2"
          value={tokenInput}
          onChange={(event) => setTokenInput(event.target.value)}
          placeholder="Enter client access token"
        />
        <AppButton onClick={() => load(tokenInput)} loading={loading} loadingText="Loading...">
          Load
        </AppButton>
      </div>

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      {requestData ? (
        <>
          <section className="mt-4 rounded border bg-white p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Request Status</p>
            <p className="mt-1 text-lg font-semibold">{requestData.request.status}</p>
            <p className="mt-2"><span className="font-semibold">Request ID:</span> <span className="font-mono">{requestData.request.id}</span></p>
            <p><span className="font-semibold">Name:</span> {requestData.request.name || "-"}</p>
            <p><span className="font-semibold">Requested Tickets:</span> {resolveSelectionLabel(requestData.request)}</p>
            <p><span className="font-semibold">Quantity:</span> {requestData.request.quantity || "-"}</p>
            <p><span className="font-semibold">Total:</span> {formatPrice(requestData.request.totalPrice)}</p>
            <p><span className="font-semibold">Submitted:</span> {formatDate(requestData.request.createdAt)}</p>
            <p><span className="font-semibold">Updated:</span> {formatDate(requestData.request.updatedAt)}</p>
          </section>

          <section className="mt-4 rounded border bg-white p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Event Details</p>
            <h2 className="mt-1 text-lg font-semibold">{requestData.event.eventName || "-"}</h2>
            <p className="mt-1">{formatDate(requestData.event.eventDate)} | {requestData.event.eventAddress || "-"}</p>
            {requestData.event.slug ? (
              <p className="mt-2 text-xs text-slate-500">Public event page: <Link className="underline" to={`/e/${requestData.event.slug}`}>/e/{requestData.event.slug}</Link></p>
            ) : null}
          </section>

          <section className="mt-4 rounded border bg-white p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Your Tickets</p>
            {requestData.tickets?.length ? (
              <div className="mt-2 space-y-2">
                {requestData.tickets.map((ticket) => (
                  <article key={ticket.ticketPublicId} className="rounded border bg-slate-50 p-3">
                    <p><span className="font-semibold">Ticket ID:</span> <span className="font-mono">{ticket.ticketPublicId}</span></p>
                    <p><span className="font-semibold">Type:</span> {ticket.ticketType || "General"}</p>
                    <p><span className="font-semibold">Status:</span> {ticket.status}</p>
                    <p><span className="font-semibold">Validity:</span> {ticket.isInvalidated ? "Invalidated" : "Valid"}</p>
                    <a className="mt-1 inline-block underline" href={ticket.ticketUrl} target="_blank" rel="noreferrer">View ticket</a>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-slate-600">No tickets assigned yet. Once approved by the organizer, your tickets will appear here.</p>
            )}
          </section>

          <section className="mt-4 rounded border bg-slate-100 p-4 text-sm text-slate-700">
            <p className="font-semibold">Organizer Messaging</p>
            <p className="mt-1">Messaging channel is not enabled yet in this version.</p>
          </section>
        </>
      ) : null}
    </main>
  );
}
