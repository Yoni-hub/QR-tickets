import { useEffect, useMemo, useState } from "react";
import AppButton from "../../components/ui/AppButton";
import { normalizeChatAttachment } from "./chatAttachment";
import { getAdminKey } from "../../lib/adminApi";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function counterpartLabel(item) {
  if (item.counterpart?.type === "ADMIN") return "Admin";
  if (item.counterpart?.type === "ORGANIZER") return `Organizer ${item.counterpart.organizerAccessCode ? `(${item.counterpart.organizerAccessCode})` : ""}`.trim();
  if (item.counterpart?.type === "CLIENT") return `Client ${item.counterpart.clientAccessToken ? `(${item.counterpart.clientAccessToken.slice(0, 8)}...)` : ""}`.trim();
  return "Conversation";
}

function resolveAttachmentHref(attachment, actorType) {
  const baseUrl = String(attachment?.downloadUrl || "").trim();
  if (!baseUrl) return "";
  if (actorType !== "ADMIN") return baseUrl;
  const adminKey = getAdminKey();
  if (!adminKey) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}adminKey=${encodeURIComponent(adminKey)}`;
}

export default function ChatInboxLayout({
  title = "Chat",
  actorType = "",
  api,
  quickStarts = [],
  listParams = {},
  pollMs = 9000,
  showAdminStatusActions = false,
}) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [attachmentLabel, setAttachmentLabel] = useState("");

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId],
  );

  const loadConversations = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.listConversations(listParams);
      const items = response.data?.items || [];
      setConversations(items);
      if (!selectedId && items.length) {
        setSelectedId(items[0].id);
      } else if (selectedId && !items.some((item) => item.id === selectedId)) {
        setSelectedId(items[0]?.id || "");
      }
      if (!silent) setFeedback("");
    } catch (error) {
      if (!silent) setFeedback(error.response?.data?.error || "Could not load conversations.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMessages = async (conversationId, silent = false) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    if (!silent) setThreadLoading(true);
    try {
      const response = await api.listMessages(conversationId);
      const items = response.data?.messages || [];
      setMessages(items);
      const readThroughMessageId = items[items.length - 1]?.id;
      await api.markRead(conversationId, readThroughMessageId ? { readThroughMessageId } : {});
      await loadConversations(true);
    } catch (error) {
      if (!silent) setFeedback(error.response?.data?.error || "Could not load messages.");
    } finally {
      if (!silent) setThreadLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const timer = setInterval(() => {
      loadConversations(true);
      loadMessages(selectedId, true);
    }, pollMs);
    return () => clearInterval(timer);
  }, [selectedId, pollMs]);

  const onPickAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const normalized = await normalizeChatAttachment(file);
      setAttachment(normalized);
      setAttachmentLabel(normalized.name || file.name);
      setFeedback("");
    } catch (error) {
      setAttachment(null);
      setAttachmentLabel("");
      setFeedback(error.message || "Could not use selected attachment.");
    }
    event.target.value = "";
  };

  const onSend = async () => {
    if (!selectedId || sending) return;
    const message = String(input || "").trim();
    if (!message && !attachment) {
      setFeedback("Type a message or attach a file.");
      return;
    }

    setSending(true);
    try {
      await api.sendMessage(selectedId, { message, attachment });
      setInput("");
      setAttachment(null);
      setAttachmentLabel("");
      await loadMessages(selectedId, true);
      await loadConversations(true);
      setFeedback("");
    } catch (error) {
      setFeedback(error.response?.data?.error || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const onStartConversation = async (payload) => {
    try {
      const response = await api.startConversation(payload);
      const conversationId = String(response.data?.conversationId || "").trim();
      await loadConversations(true);
      if (conversationId) setSelectedId(conversationId);
    } catch (error) {
      setFeedback(error.response?.data?.error || "Could not start conversation.");
    }
  };

  const onToggleStatus = async () => {
    if (!showAdminStatusActions || !selectedConversation || !api.setStatus) return;
    const nextStatus = selectedConversation.status === "CLOSED" ? "OPEN" : "CLOSED";
    try {
      await api.setStatus(selectedConversation.id, nextStatus);
      await loadConversations(true);
      await loadMessages(selectedConversation.id, true);
      setFeedback("");
    } catch (error) {
      setFeedback(error.response?.data?.error || "Could not update conversation status.");
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          {quickStarts.length ? (
            <div className="flex flex-wrap gap-2">
              {quickStarts.map((item) => (
                <AppButton key={item.label} type="button" variant="secondary" className="sm:w-auto" onClick={() => onStartConversation(item.payload)}>
                  {item.label}
                </AppButton>
              ))}
            </div>
          ) : null}
        </div>
        {feedback ? <p className="mt-2 text-sm text-red-600">{feedback}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px,1fr]">
        <div className="max-h-[72vh] overflow-y-auto rounded border bg-white p-3">
          {loading ? <p className="text-sm text-slate-500">Loading conversations...</p> : null}
          {!loading && !conversations.length ? <p className="text-sm text-slate-500">No conversations yet.</p> : null}
          <div className="space-y-2">
            {conversations.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded border p-3 text-left ${selectedId === item.id ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{counterpartLabel(item)}</p>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${item.status === "CLOSED" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.conversationType}</p>
                {item.event?.eventName ? <p className="mt-1 text-xs text-slate-500">Event: {item.event.eventName}</p> : null}
                {item.ticketRequest?.id ? <p className="mt-1 text-xs text-slate-500">Request: {item.ticketRequest.id}</p> : null}
                {item.latestMessage?.message ? <p className="mt-2 line-clamp-2 text-xs text-slate-600">{item.latestMessage.message}</p> : null}
                <p className="mt-1 text-[11px] text-slate-500">{formatDate(item.lastMessageAt)}</p>
                {item.unreadCount ? (
                  <p className="mt-1 text-xs font-semibold text-indigo-700">{item.unreadCount} unread</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          {!selectedConversation ? (
            <p className="text-sm text-slate-500">Select a conversation.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{counterpartLabel(selectedConversation)}</p>
                  <p className="text-xs text-slate-500">{selectedConversation.subject || selectedConversation.conversationType}</p>
                </div>
                {showAdminStatusActions ? (
                  <AppButton type="button" variant="secondary" className="sm:w-auto" onClick={onToggleStatus}>
                    Mark as {selectedConversation.status === "CLOSED" ? "Open" : "Closed"}
                  </AppButton>
                ) : null}
              </div>

              <div className="mt-3 h-[56vh] overflow-y-auto rounded border bg-slate-50 p-3">
                {threadLoading ? <p className="text-xs text-slate-500">Loading chat...</p> : null}
                {!threadLoading && !messages.length ? <p className="text-xs text-slate-500">No messages yet.</p> : null}
                <div className="space-y-2">
                  {messages.map((item) => {
                    const mine = item.senderType === actorType;
                    const attachmentHref = resolveAttachmentHref(item.attachment, actorType);
                    return (
                      <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[90%] rounded px-3 py-2 text-sm ${mine ? "bg-slate-900 text-white" : "bg-white border text-slate-900"}`}>
                          {item.message ? <p>{item.message}</p> : null}
                          {item.attachment?.kind === "IMAGE" ? (
                            item.attachment.legacyDataUrl ? (
                              <a className="mt-2 block" href={item.attachment.legacyDataUrl} target="_blank" rel="noreferrer">
                                <img src={item.attachment.legacyDataUrl} alt="Chat attachment" className="h-24 w-24 rounded border object-cover" />
                              </a>
                            ) : (
                              <a className="mt-2 block" href={attachmentHref} target="_blank" rel="noreferrer">
                                <img src={attachmentHref} alt="Chat attachment" className="h-24 w-24 rounded border object-cover" />
                              </a>
                            )
                          ) : null}
                          {item.attachment?.kind === "PDF" ? (
                            <a className={`mt-2 inline-block underline ${mine ? "text-slate-200" : "text-blue-700"}`} href={attachmentHref} target="_blank" rel="noreferrer">
                              Open PDF: {item.attachment.originalName}
                            </a>
                          ) : null}
                          <p className={`mt-1 text-[11px] ${mine ? "text-slate-300" : "text-slate-500"}`}>{formatDate(item.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                <textarea
                  className="min-h-[110px] w-full rounded border p-2"
                  placeholder={selectedConversation.status === "CLOSED" ? "Conversation is closed." : "Type your message..."}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={selectedConversation.status === "CLOSED"}
                />
                <input
                  className="w-full rounded border p-2 text-sm"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={onPickAttachment}
                  disabled={selectedConversation.status === "CLOSED"}
                />
                {attachmentLabel ? <p className="text-xs text-slate-600">Attached: {attachmentLabel}</p> : null}
                <AppButton type="button" onClick={onSend} loading={sending} loadingText="Sending..." disabled={selectedConversation.status === "CLOSED"}>
                  Send
                </AppButton>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
