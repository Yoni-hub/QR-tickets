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
  if (normalized === "REJECTED") return "REJECTED";
  return "PENDING";
}

function resolveRequestStatusClass(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "APPROVED") return "bg-green-100 text-green-800";
  if (normalized === "CANCELLED") return "bg-red-100 text-red-800";
  if (normalized === "REJECTED") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function resolveTicketStatus(ticket, event) {
  if (ticket.cancelledAt || ticket.isInvalidated) return "Cancelled";
  if (ticket.status === "USED") return "Used";
  const eventOver = new Date(event.eventEndDate ?? event.eventDate) < new Date();
  if (eventOver) return "Expired";
  return "Ready to use";
}

function resolveTicketStatusClass(ticketStatus) {
  if (ticketStatus === "Cancelled") return "bg-red-100 text-red-800";
  if (ticketStatus === "Used") return "bg-slate-100 text-slate-700";
  if (ticketStatus === "Expired") return "bg-slate-100 text-slate-500";
  return "bg-green-100 text-green-800";
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
    setRequestData(null);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.get(`/public/client-dashboard/${encodeURIComponent(nextToken)}`);
      setRequestData(response.data);
      sessionStorage.setItem(SESSION_TOKEN_KEY, nextToken);
      setSessionToken(nextToken);
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

  const requests = requestData?.requests || [];
  const firstRequest = requests[0] || null;

  const quickStarts = useMemo(() => {
    const eventId = firstRequest?.event?.id;
    if (!firstRequest?.id) return [{ label: "Message Admin", payload: { conversationType: "ADMIN_CLIENT", eventId } }];
    return [
      { label: "Message Organizer", payload: { conversationType: "ORGANIZER_CLIENT", ticketRequestId: firstRequest.id, eventId } },
      { label: "Message Admin", payload: { conversationType: "ADMIN_CLIENT", ticketRequestId: firstRequest.id, eventId } },
    ];
  }, [firstRequest]);

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
          {requests.length === 0 ? (
            <p className="mt-4 text-slate-600">No ticket requests found for this dashboard.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {requests.map((request) => (
                <section key={request.id} className="rounded border bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold">{request.event?.eventName || "-"}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(request.event?.eventDate)}
                        {request.event?.eventEndDate ? ` – ${formatDate(request.event.eventEndDate)}` : ""}
                        {request.event?.eventAddress ? ` · ${request.event.eventAddress}` : ""}
                      </p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${resolveRequestStatusClass(request.status)}`}>
                      {resolveRequestStatusLabel(request.status)}
                    </span>
                  </div>

                  {request.organizerMessage ? (
                    <p className="mt-2 rounded border bg-amber-50 p-2 text-xs text-amber-900">
                      Organizer message: {request.organizerMessage}
                    </p>
                  ) : null}

                  {request.status === "APPROVED" && request.tickets?.length ? (
                    <div className="mt-3 space-y-2">
                      {request.tickets.map((ticket) => {
                        const ticketStatus = resolveTicketStatus(ticket, request.event);
                        return (
                          <article key={ticket.ticketPublicId} className="rounded border bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold">{ticket.ticketType || "General"}</p>
                              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${resolveTicketStatusClass(ticketStatus)}`}>
                                {ticketStatus}
                              </span>
                            </div>

                            {ticketStatus === "Used" && ticket.scannedAt ? (
                              <p className="mt-1 text-xs text-slate-500">Scanned at {formatDate(ticket.scannedAt)}</p>
                            ) : null}

                            {ticketStatus === "Cancelled" ? (
                              <p className="mt-1 text-xs text-red-700">
                                Cancelled at {formatDate(ticket.cancelledAt)}
                                {ticket.cancellationReason
                                  ? `: ${ticket.cancellationReason === "OTHER" ? ticket.cancellationOtherReason || "Other" : ticket.cancellationReason.replaceAll("_", " ").toLowerCase()}`
                                  : ""}
                              </p>
                            ) : null}

                            {ticketStatus === "Expired" ? (
                              <p className="mt-1 text-xs text-slate-400">Event has ended</p>
                            ) : null}

                            {ticketStatus === "Ready to use" ? (
                              <a
                                className="mt-2 inline-block text-xs font-semibold text-blue-700 underline break-all"
                                href={ticket.ticketUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open Ticket Link
                              </a>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : request.status === "APPROVED" ? (
                    <p className="mt-2 text-slate-600">No tickets assigned yet.</p>
                  ) : null}
                </section>
              ))}
            </div>
          )}

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
