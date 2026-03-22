import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import ChatInboxLayout from "../features/chat/ChatInboxLayout";
import { clientChatApi } from "../features/chat/chatApi";

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

const SESSION_TOKEN_KEY = "qr-client-token";

export default function ClientDashboardPage() {
  const { clientAccessToken: routeToken = "" } = useParams();
  const navigate = useNavigate();
  const [sessionToken, setSessionToken] = useState(() => sessionStorage.getItem(SESSION_TOKEN_KEY) || "");
  const [tokenInput, setTokenInput] = useState(sessionToken);
  const [loading, setLoading] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });

  const normalizedToken = useMemo(() => String(routeToken || sessionToken || "").trim(), [routeToken, sessionToken]);

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

  // Move URL token to sessionStorage and redirect to clean URL
  useEffect(() => {
    const t = String(routeToken || "").trim();
    if (!t) return;
    sessionStorage.setItem(SESSION_TOKEN_KEY, t);
    setSessionToken(t);
    setTokenInput(t);
    navigate("/client", { replace: true });
  }, [routeToken, navigate]);

  // Auto-load when token is available (but not while mid-redirect)
  useEffect(() => {
    if (!normalizedToken || routeToken) return;
    setTokenInput(normalizedToken);
    load(normalizedToken);
  }, [sessionToken, routeToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatApi = useMemo(() => {
    const token = String(normalizedToken || tokenInput || "").trim();
    return {
      listConversations: (params = {}) => clientChatApi.listConversations(token, params),
      startConversation: (data) => clientChatApi.startConversation(token, data),
      listMessages: (conversationId) => clientChatApi.listMessages(token, conversationId),
      sendMessage: (conversationId, payload) => clientChatApi.sendMessage(token, conversationId, payload),
      markRead: (conversationId, data) => clientChatApi.markRead(token, conversationId, data),
    };
  }, [normalizedToken, tokenInput]);

  const quickStarts = useMemo(() => {
    const eventId = requestData?.event?.id;
    if (!requestData?.request?.id) return [{ label: "Message Admin", payload: { conversationType: "ADMIN_CLIENT", eventId } }];
    return [
      { label: "Message Organizer", payload: { conversationType: "ORGANIZER_CLIENT", ticketRequestId: requestData.request.id, eventId } },
      { label: "Message Admin", payload: { conversationType: "ADMIN_CLIENT", ticketRequestId: requestData.request.id, eventId } },
    ];
  }, [requestData]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Client Dashboard</h1>
      <p className="mt-1 text-sm text-slate-600">Track your request status and message organizer/admin from one inbox.</p>

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

      <div className="mt-2 flex flex-wrap gap-4">
        <Link to="/" className="text-sm text-slate-500 underline hover:text-slate-800">Back to home</Link>
        <Link to="/help?tab=support&role=customer" className="text-sm text-red-600 underline hover:text-red-800">Lost your access token?</Link>
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

          <section className="mt-4">
            <ChatInboxLayout
              title="Chat"
              actorType="CLIENT"
              api={chatApi}
              quickStarts={quickStarts}
              socketCredentials={{ clientAccessToken: normalizedToken || tokenInput }}
            />
          </section>
        </>
      ) : null}
    </main>
  );
}
