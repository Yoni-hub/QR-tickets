import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function resolveRequestStatusLabel(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "APPROVED") return "APPROVED";
  if (normalized === "CANCELLED") return "CANCELLED";
  return "PENDING";
}

export default function ClientDashboardPage() {
  const { clientAccessToken: routeToken = "" } = useParams();
  const [tokenInput, setTokenInput] = useState(routeToken);
  const [loading, setLoading] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  const normalizedToken = useMemo(() => String(routeToken || "").trim(), [routeToken]);

  const load = async (token) => {
    const nextToken = String(token || "").trim();
    if (!nextToken || loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.get(`/public/client-dashboard/${encodeURIComponent(nextToken)}`);
      setRequestData(response.data);
      setChatMessages([]);
      setChatInput("");
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

  const loadMessages = async (token, { silent = false } = {}) => {
    const nextToken = String(token || "").trim();
    if (!nextToken) return;
    if (!silent) setChatLoading(true);
    try {
      const response = await api.get(`/public/client-dashboard/${encodeURIComponent(nextToken)}/messages`);
      setChatMessages(response.data.messages || []);
    } catch (requestError) {
      if (!silent) {
        setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not load organizer chat." });
      }
    } finally {
      if (!silent) setChatLoading(false);
    }
  };

  const sendMessage = async () => {
    const token = String(normalizedToken || tokenInput || "").trim();
    const message = String(chatInput || "").trim();
    if (!token || !message || chatSending) return;

    setChatSending(true);
    try {
      await api.post(`/public/client-dashboard/${encodeURIComponent(token)}/messages`, { message });
      setChatInput("");
      await loadMessages(token, { silent: true });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not send message." });
    } finally {
      setChatSending(false);
    }
  };

  useEffect(() => {
    if (!requestData || !normalizedToken) return;
    loadMessages(normalizedToken);
  }, [requestData, normalizedToken]);

  useEffect(() => {
    if (!requestData || !normalizedToken) return undefined;
    const interval = setInterval(() => loadMessages(normalizedToken, { silent: true }), 8000);
    return () => clearInterval(interval);
  }, [requestData, normalizedToken]);

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
            <p className="text-xs uppercase tracking-wide text-slate-500">Event Details</p>
            <h2 className="mt-1 text-lg font-semibold">{requestData.event.eventName || "-"}</h2>
            <p className="mt-1">{formatDate(requestData.event.eventDate)} | {requestData.event.eventAddress || "-"}</p>
          </section>

          <section className="mt-4 rounded border bg-white p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Your Tickets</p>
            <p className="mt-2"><span className="font-semibold">Status:</span> {resolveRequestStatusLabel(requestData.request?.status)}</p>
            {requestData.request?.organizerMessage ? (
              <p className="mt-1 rounded border bg-amber-50 p-2 text-xs text-amber-900">
                Organizer message: {requestData.request.organizerMessage}
              </p>
            ) : null}
            {requestData.request?.cancellationEvidenceImageDataUrl ? (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-600">Cancellation evidence</p>
                <a className="mt-1 inline-block" href={requestData.request.cancellationEvidenceImageDataUrl} target="_blank" rel="noreferrer">
                  <img src={requestData.request.cancellationEvidenceImageDataUrl} alt="Cancellation evidence" className="h-20 w-20 rounded border object-cover" />
                </a>
              </div>
            ) : null}
            {requestData.tickets?.length ? (
              <div className="mt-2 space-y-2">
                {requestData.tickets.map((ticket) => (
                  <article key={ticket.ticketPublicId} className="rounded border bg-slate-50 p-3">
                    <p><span className="font-semibold">Type:</span> {ticket.ticketType || "General"}</p>
                    {ticket.cancelledAt ? (
                      <p className="mt-2 text-xs text-red-700">
                        Cancelled at {formatDate(ticket.cancelledAt)}: {ticket.cancellationReason === "OTHER" ? ticket.cancellationOtherReason || "Other" : ticket.cancellationReason?.replaceAll("_", " ").toLowerCase()}
                      </p>
                    ) : (
                      <a className="mt-2 inline-block text-xs font-semibold text-blue-700 underline break-all" href={ticket.ticketUrl} target="_blank" rel="noreferrer">
                        Open Ticket Link
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-slate-600">No tickets assigned yet. Once approved by the organizer, your tickets will appear here.</p>
            )}
          </section>

          <section className="mt-4 rounded border bg-white p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Message Organizer</p>
            <div className="mt-2 h-64 overflow-y-auto rounded border bg-slate-50 p-2">
              {chatLoading ? (
                <p className="text-xs text-slate-500">Loading chat...</p>
              ) : chatMessages.length ? (
                <div className="space-y-2">
                  {chatMessages.map((message) => {
                    const isClient = message.senderType === "CLIENT";
                    return (
                      <div key={message.id} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded px-2 py-1 text-xs ${isClient ? "bg-indigo-600 text-white" : "bg-white text-slate-900 border"}`}>
                          <p>{message.message}</p>
                          {message.evidenceImageDataUrl ? (
                            <a className="mt-2 block" href={message.evidenceImageDataUrl} target="_blank" rel="noreferrer">
                              <img src={message.evidenceImageDataUrl} alt="Message evidence" className="h-20 w-20 rounded border object-cover" />
                            </a>
                          ) : null}
                          <p className={`mt-1 text-[10px] ${isClient ? "text-indigo-100" : "text-slate-500"}`}>
                            {formatDate(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No messages yet.</p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <textarea
                className="w-full rounded border p-2 text-sm"
                rows={3}
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Write message to organizer..."
              />
              <AppButton
                type="button"
                className="self-end"
                variant="indigo"
                onClick={sendMessage}
                loading={chatSending}
                loadingText="Sending..."
              >
                Send
              </AppButton>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
