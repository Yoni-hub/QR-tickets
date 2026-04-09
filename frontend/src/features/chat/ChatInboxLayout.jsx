import { useEffect, useMemo, useRef, useState } from "react";
import AppButton from "../../components/ui/AppButton";
import { normalizeChatAttachment } from "./chatAttachment";
import { getAdminKey } from "../../lib/adminApi";
import { joinConversation, leaveConversation, onNewMessage } from "../../lib/socket";

function formatRelativeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function recoveryInfo(item) {
  const s = String(item.subject || "");
  // Subject-based detection (works after server restart picks up chatController fix)
  if (s.startsWith("Organizer Recovery:")) {
    const name = s.replace(/^Organizer Recovery:\s*/, "").trim();
    return { name: name || "Organizer", role: "Organizer Recovery" };
  }
  if (s.startsWith("Client Recovery:")) {
    const name = s.replace(/^Client Recovery:\s*/, "").trim();
    return { name: name || "Buyer", role: "Buyer Recovery" };
  }
  // Message-based fallback — works for existing conversations where subject wasn't set correctly
  const msg = String(item.latestMessage?.message || "");
  if (msg.startsWith("ORGANIZER ACCESS CODE RECOVERY REQUEST")) {
    const nameMatch = msg.match(/Organizer name:\s*(.+)/);
    return { name: nameMatch?.[1]?.trim() || "Organizer", role: "Organizer Recovery" };
  }
  if (msg.startsWith("CLIENT ACCESS TOKEN RECOVERY REQUEST")) {
    const nameMatch = msg.match(/Buyer name:\s*(.+)/);
    return { name: nameMatch?.[1]?.trim() || "Buyer", role: "Buyer Recovery" };
  }
  return null;
}

function counterpartName(item) {
  if (item.counterpart?.type === "ADMIN") return "Support Admin";
  if (item.counterpart?.type === "ORGANIZER")
    return item.event?.organizerName || item.event?.eventName || "Organizer";
  if (item.counterpart?.type === "CLIENT") {
    const rec = recoveryInfo(item);
    if (rec) return rec.name;
    return item.ticketRequest?.name || "Buyer";
  }
  return "Conversation";
}

function counterpartRoleLabel(item) {
  if (item.counterpart?.type === "ADMIN") return "Admin";
  if (item.counterpart?.type === "ORGANIZER") return "Organizer";
  if (item.counterpart?.type === "CLIENT") {
    const rec = recoveryInfo(item);
    if (rec) return rec.role;
    return "Buyer";
  }
  return "";
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

function renderMessageWithLinkButtons(message, mine) {
  const text = String(message || "");
  if (!text.trim()) return null;

  const urlRegex = /(https?:\/\/\S+)/g;
  const lines = text.split("\n");
  const linkClass = `mt-2 inline-flex items-center justify-center rounded border px-3 py-2 text-xs font-semibold ${
    mine
      ? "border-slate-700 text-slate-200 hover:bg-slate-800"
      : "border-slate-200 text-blue-700 hover:bg-slate-50"
  }`;

  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        const parts = String(line || "").split(urlRegex).filter((p) => p !== "");
        const urls = parts.filter((p) => p.startsWith("http://") || p.startsWith("https://"));
        if (!urls.length) {
          return (
            <p key={idx} className="whitespace-pre-wrap break-words">
              {line}
            </p>
          );
        }

        const plainText = parts.filter((p) => !(p.startsWith("http://") || p.startsWith("https://"))).join("").trim();
        const labelBase = plainText.toLowerCase().includes("dashboard") ? "Open dashboard" : "Open link";

        return (
          <div key={idx} className="whitespace-pre-wrap break-words">
            {plainText ? <p>{plainText}</p> : null}
            {urls.map((href) => (
              <a key={href} className={linkClass} href={href} target="_blank" rel="noreferrer">
                {labelBase}
              </a>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function ChatInboxLayout({
  title = "Chat",
  actorType = "",
  api,
  quickStarts = [],
  listParams = {},
  socketCredentials = null,
  showAdminStatusActions = false,
  onUnreadCountChange,
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
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileView, setMobileView] = useState("list"); // "list" | "thread"

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId],
  );

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((item) => {
      const name = counterpartName(item).toLowerCase();
      const event = String(item.event?.eventName || "").toLowerCase();
      const subject = String(item.subject || "").toLowerCase();
      return name.includes(q) || event.includes(q) || subject.includes(q);
    });
  }, [conversations, searchQuery]);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversations = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.listConversations(listParams);
      const items = response.data?.items || [];
      setConversations(items);
      const totalUnread = items.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
      onUnreadCountChange?.(totalUnread);
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

  // WebSocket: join/leave room when selected conversation changes
  useEffect(() => {
    if (!selectedId || !socketCredentials) return undefined;

    joinConversation(selectedId, socketCredentials);
    const unsub = onNewMessage((msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Refresh conversation list to update unread counts + latest message
      loadConversations(true);
    });

    return () => {
      unsub();
      leaveConversation(selectedId);
    };
  }, [selectedId, socketCredentials]);

  const onPickAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    try {
      const normalized = await normalizeChatAttachment(file);
      setAttachment(normalized);
      setAttachmentLabel(normalized.name || file.name);
      if (normalized.type?.startsWith("image/")) {
        setAttachmentPreviewUrl(URL.createObjectURL(normalized));
      } else {
        setAttachmentPreviewUrl("");
      }
      setFeedback("");
    } catch (error) {
      setAttachment(null);
      setAttachmentLabel("");
      setAttachmentPreviewUrl("");
      setFeedback(error.message || "Could not use selected attachment.");
    }
    event.target.value = "";
  };

  const clearAttachment = () => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    setAttachment(null);
    setAttachmentLabel("");
    setAttachmentPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      clearAttachment();
      await loadMessages(selectedId, true);
      await loadConversations(true);
      setFeedback("");
    } catch (error) {
      setFeedback(error.response?.data?.error || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const onComposerKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const onStartConversation = async (payload) => {
    try {
      const response = await api.startConversation(payload);
      const conversationId = String(response.data?.conversationId || "").trim();
      await loadConversations(true);
      if (conversationId) {
        setSelectedId(conversationId);
        setMobileView("thread");
      }
    } catch (error) {
      setFeedback(error.response?.data?.error || "Could not start conversation.");
    }
  };

  const onSelectConversation = (id) => {
    setSelectedId(id);
    setMobileView("thread");
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

  const isClosed = selectedConversation?.status === "CLOSED";

  // ── Conversation list panel ──────────────────────────────────────────────
  const listPanel = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b p-3">
        <input
          className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-400"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading...</p>
        ) : filteredConversations.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-slate-600">
              {searchQuery ? "No matching conversations" : "No conversations yet"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {searchQuery
                ? "Try a different search term."
                : "Use the buttons above to start a conversation."}
            </p>
          </div>
        ) : (
          filteredConversations.map((item) => {
            const isSelected = item.id === selectedId;
            const unread = item.unreadCount || 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectConversation(item.id)}
                className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-slate-50 ${isSelected ? "bg-slate-100" : "bg-white"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`truncate text-sm ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                        {counterpartName(item)}
                      </p>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {counterpartRoleLabel(item)}
                      </span>
                    </div>
                    {item.event?.eventName ? (
                      <p className="mt-0.5 truncate text-xs text-slate-400">{item.event.eventName}</p>
                    ) : null}
                    {item.latestMessage?.message ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.latestMessage.message}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="text-[10px] text-slate-400">{formatRelativeTime(item.lastMessageAt)}</p>
                    {unread > 0 ? (
                      <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Thread panel ─────────────────────────────────────────────────────────
  const threadPanel = (
    <div className="flex h-full flex-col overflow-hidden">
      {!selectedConversation ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <p className="text-2xl">💬</p>
          <p className="mt-2 text-sm font-medium text-slate-600">Select a conversation</p>
          <p className="mt-1 text-xs text-slate-400">Choose a thread on the left to start chatting.</p>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 lg:hidden"
                onClick={() => setMobileView("list")}
                aria-label="Back to conversations"
              >
                ←
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{counterpartName(selectedConversation)}</p>
                <p className="truncate text-xs text-slate-500">
                  {counterpartRoleLabel(selectedConversation)}
                  {selectedConversation.event?.eventName ? ` · ${selectedConversation.event.eventName}` : ""}
                  {selectedConversation.subject ? ` · ${selectedConversation.subject}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${isClosed ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}
              >
                {selectedConversation.status}
              </span>
              {showAdminStatusActions && api.setStatus ? (
                <AppButton type="button" variant="secondary" className="py-1 text-xs sm:w-auto" onClick={onToggleStatus}>
                  {isClosed ? "Reopen" : "Close"}
                </AppButton>
              ) : null}
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
            {threadLoading ? (
              <p className="text-center text-xs text-slate-500">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-xs text-slate-500">No messages yet. Start the conversation!</p>
            ) : (
              <div className="space-y-3">
                {messages.map((item) => {
                  // SYSTEM messages: centered pill
                  if (item.messageType === "SYSTEM") {
                    return (
                      <div key={item.id} className="flex flex-col items-center gap-0.5">
                        <div className="rounded-full bg-slate-100 px-4 py-1.5 text-xs text-slate-500 text-center max-w-[80%]">
                          {item.message}
                        </div>
                        {item.emailStatus === "SENT" ? (
                          <p className="text-[10px] text-emerald-600">✓ Email sent</p>
                        ) : item.emailStatus === "FAILED" ? (
                          <p className="text-[10px] text-red-500">✗ Email failed</p>
                        ) : null}
                      </div>
                    );
                  }

                  const mine = item.senderType === actorType;
                  const attachmentHref = resolveAttachmentHref(item.attachment, actorType);
                  return (
                    <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        <div
                          className={`max-w-full rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                            mine
                              ? "rounded-br-sm bg-slate-900 text-white"
                              : "rounded-bl-sm border bg-white text-slate-900"
                          }`}
                          style={{ maxWidth: "min(75%, 500px)" }}
                        >
                          {item.message ? (
                            renderMessageWithLinkButtons(item.message, mine)
                          ) : null}
                          {item.attachment?.kind === "IMAGE" ? (
                            item.attachment.legacyDataUrl ? (
                              <a className="mt-2 block" href={item.attachment.legacyDataUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={item.attachment.legacyDataUrl}
                                  alt="Attachment"
                                  className="max-h-48 rounded-lg border object-contain"
                                />
                              </a>
                            ) : (
                              <a className="mt-2 block" href={attachmentHref} target="_blank" rel="noreferrer">
                                <img
                                  src={attachmentHref}
                                  alt="Attachment"
                                  className="max-h-48 rounded-lg border object-contain"
                                />
                              </a>
                            )
                          ) : null}
                          {item.attachment?.kind === "PDF" ? (
                            <a
                              className={`mt-2 flex items-center gap-1.5 rounded border px-3 py-2 text-xs ${
                                mine
                                  ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                                  : "border-slate-200 text-blue-700 hover:bg-slate-50"
                              }`}
                              href={attachmentHref}
                              target="_blank"
                              rel="noreferrer"
                            >
                              📄 {item.attachment.originalName}
                            </a>
                          ) : null}
                          <p className="mt-1 text-[10px] text-slate-400">
                            {formatMessageTime(item.createdAt)}
                          </p>
                        </div>
                        {mine ? (
                          <p className={`mt-0.5 text-[10px] ${item.emailStatus === "SENT" ? "text-emerald-600" : item.emailStatus === "FAILED" ? "text-red-500" : "text-slate-400"}`}>
                            {item.emailStatus === "SENT" ? "✓ Email sent" : item.emailStatus === "FAILED" ? "✗ Email failed" : "✓ Sent"}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t bg-white px-3 py-3">
            {feedback ? <p className="mb-2 text-xs text-red-600">{feedback}</p> : null}
            {attachmentLabel ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
                {attachmentPreviewUrl ? (
                  <img src={attachmentPreviewUrl} alt="Preview" className="h-10 w-10 rounded border object-cover" />
                ) : (
                  <span className="text-base">📄</span>
                )}
                <p className="min-w-0 flex-1 truncate text-xs text-slate-600">{attachmentLabel}</p>
                <button
                  type="button"
                  className="shrink-0 text-xs text-red-500 hover:text-red-700"
                  onClick={clearAttachment}
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-slate-400 disabled:bg-slate-50"
                rows={2}
                placeholder={isClosed ? "Conversation is closed." : "Message… (Enter to send, Shift+Enter for new line)"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onComposerKeyDown}
                disabled={isClosed}
              />
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  title="Attach image or PDF (max 10 MB)"
                  disabled={isClosed}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-9 w-9 items-center justify-center rounded-full border bg-slate-50 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                >
                  📎
                </button>
                <button
                  type="button"
                  disabled={isClosed || sending || (!input.trim() && !attachment)}
                  onClick={onSend}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40"
                  aria-label="Send"
                >
                  {sending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                  ) : (
                    <span className="text-base leading-none">↑</span>
                  )}
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={onPickAttachment}
              className="hidden"
            />
          </div>
        </>
      )}
    </div>
  );

  return (
    <section className="space-y-3">
      {/* Header + quick starts */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white px-4 py-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {quickStarts.length ? (
          <div className="flex flex-wrap gap-2">
            {quickStarts.map((item) => (
              <AppButton
                key={item.label}
                type="button"
                variant="secondary"
                className="sm:w-auto"
                onClick={() => onStartConversation(item.payload)}
              >
                {item.label}
              </AppButton>
            ))}
          </div>
        ) : null}
      </div>
      {feedback && !selectedId ? <p className="text-sm text-red-600">{feedback}</p> : null}

      {/* Chat panels */}
      <div
        className="overflow-hidden rounded border bg-white"
        style={{ height: "max(72vh, 480px)" }}
      >
        {/* Desktop: two-column */}
        <div className="hidden h-full lg:grid lg:grid-cols-[320px,1fr]">
          <div className="h-full overflow-hidden border-r">{listPanel}</div>
          <div className="h-full overflow-hidden">{threadPanel}</div>
        </div>
        {/* Mobile: single panel */}
        <div className="h-full lg:hidden">
          {mobileView === "list" ? listPanel : threadPanel}
        </div>
      </div>
    </section>
  );
}
