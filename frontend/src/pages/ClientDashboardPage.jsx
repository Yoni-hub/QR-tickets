import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import ChatInboxLayout from "../features/chat/ChatInboxLayout";
import { clientChatApi } from "../features/chat/chatApi";

const TAB_ICONS = {
  events: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  tickets: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  ),
  chat: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
};

const TABS = [
  { id: "events", label: "Events" },
  { id: "tickets", label: "Tickets" },
  { id: "chat", label: "Chat" },
];

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
  const [activeTab, setActiveTab] = useState("events");
  const [showTokenPanel, setShowTokenPanel] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState(() => new Set());

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
      setShowTokenPanel(false);
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

  // Auto-load when token is available
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
  const clientEmail = requestData?.email || "";
  const clientName = requests[0]?.name || "";

  const firstRequest = requests[0] || null;
  const quickStarts = useMemo(() => {
    const eventId = firstRequest?.event?.id;
    if (!firstRequest?.id) return [{ label: "Message Admin", payload: { conversationType: "ADMIN_CLIENT", eventId } }];
    return [
      { label: "Message Organizer", payload: { conversationType: "ORGANIZER_CLIENT", ticketRequestId: firstRequest.id, eventId } },
      { label: "Message Admin", payload: { conversationType: "ADMIN_CLIENT", ticketRequestId: firstRequest.id, eventId } },
    ];
  }, [firstRequest]);

  // Group requests by event
  const eventGroups = useMemo(() => {
    const map = new Map();
    for (const req of requests) {
      const id = req.event?.id ?? "__unknown__";
      if (!map.has(id)) map.set(id, { event: req.event, requests: [] });
      map.get(id).requests.push(req);
    }
    return Array.from(map.values());
  }, [requests]);

  // All tickets across all requests
  const allTickets = useMemo(() => {
    return requests.flatMap((req) =>
      (req.tickets || []).map((t) => ({ ...t, event: req.event, requestStatus: req.status }))
    );
  }, [requests]);

  // Expand active events by default
  useEffect(() => {
    if (eventGroups.length === 0) return;
    const now = new Date();
    const defaultOpen = new Set(
      eventGroups
        .filter(({ event }) => {
          if (!event) return true;
          const end = new Date(event.eventEndDate ?? event.eventDate ?? 0);
          return end >= now;
        })
        .map(({ event }) => event?.id ?? "__unknown__")
    );
    if (defaultOpen.size === 0 && eventGroups[0]) {
      defaultOpen.add(eventGroups[0].event?.id ?? "__unknown__");
    }
    setExpandedEvents(defaultOpen);
  }, [eventGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEvent = (eventId) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const groupSummary = (group) => {
    const totalTickets = group.requests.reduce((n, r) => n + (r.tickets?.length || 0), 0);
    const hasPending = group.requests.some((r) => r.status === "PENDING_VERIFICATION" || r.status === "PENDING");
    const hasApproved = group.requests.some((r) => r.status === "APPROVED");
    const allCancelled = group.requests.every((r) => r.status === "CANCELLED" || r.status === "REJECTED");
    if (allCancelled) return { label: "Cancelled", cls: "bg-red-100 text-red-800" };
    if (hasPending && !hasApproved) return { label: "Pending approval", cls: "bg-amber-100 text-amber-800" };
    if (totalTickets > 0) return { label: `${totalTickets} ticket${totalTickets !== 1 ? "s" : ""}`, cls: "bg-green-100 text-green-800" };
    return { label: "Approved", cls: "bg-green-100 text-green-800" };
  };

  // ── Token entry screen ───────────────────────────────────────────────────
  if (!requestData && !loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="w-full max-w-sm py-12">
            <h2 className="text-center text-2xl font-bold text-slate-900">Your tickets</h2>
            <p className="mt-2 text-center text-sm text-slate-500">Enter your client access token to view your dashboard.</p>

            <div className="mt-6">
              <input
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-center font-mono tracking-widest text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Your access token"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") load(tokenInput); }}
              />
            </div>

            <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

            <button
              type="button"
              onClick={() => load(tokenInput)}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-base font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" aria-hidden="true" /> : null}
              {loading ? "Loading…" : "Continue →"}
            </button>

            <div className="mt-6 flex flex-col items-center gap-3">
              <a href="/help?tab=support&role=customer" className="text-sm font-medium text-red-500 hover:text-red-700">
                Lost your access token?
              </a>
              <a href="/" className="text-sm text-slate-400 hover:text-slate-600">← Back to home</a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Loaded dashboard ─────────────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      {/* Compact header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-slate-900">{clientName || "My Tickets"}</h1>
          {clientEmail ? (
            <p className="truncate text-xs text-slate-500">{clientEmail}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowTokenPanel((o) => !o)}
          className="ml-3 flex-shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Account options"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {/* Token panel */}
      {showTokenPanel ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Your access token</p>
            <p className="break-all rounded border bg-white px-3 py-2 font-mono text-xs text-slate-700">{normalizedToken}</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Load a different token</p>
            <div className="flex gap-2">
              <input
                className="w-full rounded border border-slate-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste token here"
                onKeyDown={(e) => { if (e.key === "Enter") load(tokenInput); }}
              />
              <button
                type="button"
                onClick={() => load(tokenInput)}
                disabled={loading}
                className="flex-shrink-0 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {loading ? "…" : "Load"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      {/* Tab bar */}
      <div className="mt-4 -mx-4 sm:-mx-6 border-b border-slate-200">
        <div className="flex overflow-x-auto no-scrollbar px-4 sm:px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-shrink-0 flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "border-b-2 border-transparent text-slate-500"
              }`}
            >
              {TAB_ICONS[tab.id]}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events tab */}
      {activeTab === "events" ? (
        <div className="mt-4">
          {eventGroups.length === 0 ? (
            <p className="text-sm text-slate-500">No events found.</p>
          ) : (
            <div className="space-y-3">
              {eventGroups.map((group) => {
                const eventId = group.event?.id ?? "__unknown__";
                const isOpen = expandedEvents.has(eventId);
                const summary = groupSummary(group);
                return (
                  <section key={eventId} className="rounded border bg-white text-sm overflow-hidden">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      onClick={() => toggleEvent(eventId)}
                    >
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold truncate">{group.event?.eventName || "-"}</h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDate(group.event?.eventDate)}
                          {group.event?.eventEndDate ? ` – ${formatDate(group.event.eventEndDate)}` : ""}
                          {group.event?.eventAddress ? ` · ${group.event.eventAddress}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${summary.cls}`}>{summary.label}</span>
                        <svg className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t px-4 pb-4 pt-3 space-y-4">
                        {group.requests.map((request) => (
                          <div key={request.id}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-slate-500">Request #{request.id.slice(-6).toUpperCase()}</p>
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
                              <div className="mt-2 space-y-2">
                                {request.tickets.map((ticket) => {
                                  const ticketStatus = resolveTicketStatus(ticket, request.event);
                                  return (
                                    <article key={ticket.ticketPublicId} className="rounded border bg-slate-50 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <p className="font-semibold">{ticket.ticketType || "General"}</p>
                                          {ticket.ticketPrice != null && ticket.ticketPrice > 0 ? (
                                            <p className="text-xs text-slate-500">{request.event?.currency || "$"}{Number(ticket.ticketPrice).toFixed(2)}</p>
                                          ) : ticket.ticketPrice === 0 ? (
                                            <p className="text-xs text-slate-500">Free</p>
                                          ) : null}
                                        </div>
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
                                          {ticket.cancellationReason ? `: ${ticket.cancellationReason === "OTHER" ? ticket.cancellationOtherReason || "Other" : ticket.cancellationReason.replaceAll("_", " ").toLowerCase()}` : ""}
                                        </p>
                                      ) : null}
                                      {ticketStatus === "Expired" ? (
                                        <p className="mt-1 text-xs text-slate-400">Event has ended</p>
                                      ) : null}
                                      {ticketStatus === "Ready to use" ? (
                                        <a className="mt-2 inline-block text-xs font-semibold text-blue-700 underline break-all" href={ticket.ticketUrl} target="_blank" rel="noreferrer">
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
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Tickets tab */}
      {activeTab === "tickets" ? (
        <div className="mt-4">
          {allTickets.length === 0 ? (
            <p className="text-sm text-slate-500">No tickets yet. Your tickets will appear here once a request is approved.</p>
          ) : (
            <div className="space-y-3">
              {allTickets.map((ticket) => {
                const ticketStatus = resolveTicketStatus(ticket, ticket.event);
                return (
                  <article key={ticket.ticketPublicId} className="rounded border bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{ticket.ticketType || "General"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{ticket.event?.eventName || "-"}</p>
                        {ticket.ticketPrice != null && ticket.ticketPrice > 0 ? (
                          <p className="mt-0.5 text-xs text-slate-400">{ticket.event?.currency || "$"}{Number(ticket.ticketPrice).toFixed(2)}</p>
                        ) : ticket.ticketPrice === 0 ? (
                          <p className="mt-0.5 text-xs text-slate-400">Free</p>
                        ) : null}
                      </div>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${resolveTicketStatusClass(ticketStatus)}`}>
                        {ticketStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 font-mono">{ticket.ticketPublicId}</p>
                    {ticketStatus === "Used" && ticket.scannedAt ? (
                      <p className="mt-1 text-xs text-slate-500">Scanned at {formatDate(ticket.scannedAt)}</p>
                    ) : null}
                    {ticketStatus === "Cancelled" ? (
                      <p className="mt-1 text-xs text-red-700">
                        Cancelled at {formatDate(ticket.cancelledAt)}
                        {ticket.cancellationReason ? `: ${ticket.cancellationReason === "OTHER" ? ticket.cancellationOtherReason || "Other" : ticket.cancellationReason.replaceAll("_", " ").toLowerCase()}` : ""}
                      </p>
                    ) : null}
                    {ticketStatus === "Ready to use" ? (
                      <a className="mt-2 inline-block text-xs font-semibold text-blue-700 underline break-all" href={ticket.ticketUrl} target="_blank" rel="noreferrer">
                        Open Ticket Link
                      </a>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Chat tab */}
      {activeTab === "chat" ? (
        <div className="mt-4">
          <ChatInboxLayout
            title="Chat"
            actorType="CLIENT"
            api={chatApi}
            quickStarts={quickStarts}
            socketCredentials={{ clientAccessToken: normalizedToken || tokenInput }}
          />
        </div>
      ) : null}
    </main>
  );
}
