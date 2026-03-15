import { useEffect, useMemo, useState } from "react";
import AppButton from "../../components/ui/AppButton";
import { adminApi } from "../../lib/adminApi";
import { MAX_EVIDENCE_INPUT_BYTES, optimizeEvidenceDataUrl } from "../../lib/evidenceImage";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminSupportPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [search, setSearch] = useState("");

  const activeConversation = useMemo(
    () => items.find((item) => item.id === selectedId) || conversation,
    [items, selectedId, conversation],
  );

  const loadConversations = async (options = {}) => {
    const silent = Boolean(options.silent);
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await adminApi.get("/support/conversations", {
        params: {
          status: statusFilter === "ALL" ? undefined : statusFilter,
          q: search || undefined,
        },
      });
      const nextItems = response.data.items || [];
      setItems(nextItems);
      if (!selectedId && nextItems.length) {
        setSelectedId(nextItems[0].id);
      } else if (selectedId && !nextItems.some((item) => item.id === selectedId)) {
        setSelectedId(nextItems[0]?.id || "");
      }
    } catch (requestError) {
      if (!silent) setError(requestError.response?.data?.error || "Could not load support conversations.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMessages = async (conversationId, options = {}) => {
    if (!conversationId) return;
    const silent = Boolean(options.silent);
    if (!silent) setError("");
    try {
      const response = await adminApi.get(`/support/conversations/${encodeURIComponent(conversationId)}/messages`);
      setConversation(response.data.conversation || null);
      setMessages(response.data.messages || []);
    } catch (requestError) {
      if (!silent) setError(requestError.response?.data?.error || "Could not load conversation messages.");
    }
  };

  useEffect(() => {
    loadConversations();
  }, [statusFilter]);

  useEffect(() => {
    if (!selectedId) {
      setConversation(null);
      setMessages([]);
      return;
    }
    loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const interval = setInterval(() => {
      loadConversations({ silent: true });
      loadMessages(selectedId, { silent: true });
    }, 9000);
    return () => clearInterval(interval);
  }, [selectedId, statusFilter, search]);

  const onSearchSubmit = async (event) => {
    event.preventDefault();
    await loadConversations();
  };

  const onAttachImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Attachment must be an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_EVIDENCE_INPUT_BYTES) {
      setError("Image is too large. Maximum upload size is 8MB.");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await optimizeEvidenceDataUrl(file);
      setPendingImageDataUrl(dataUrl);
      setError("");
    } catch {
      setError("Could not process image.");
    }
    event.target.value = "";
  };

  const sendMessage = async () => {
    if (!selectedId) return;
    const message = String(chatInput || "").trim();
    if (!message) {
      setError("Message is required.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await adminApi.post(`/support/conversations/${encodeURIComponent(selectedId)}/messages`, {
        message,
        evidenceImageDataUrl: pendingImageDataUrl || null,
      });
      setChatInput("");
      setPendingImageDataUrl("");
      await Promise.all([loadMessages(selectedId, { silent: true }), loadConversations({ silent: true })]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not send admin support message.");
    } finally {
      setSending(false);
    }
  };

  const toggleStatus = async () => {
    if (!selectedId || !conversation) return;
    const nextStatus = conversation.status === "CLOSED" ? "OPEN" : "CLOSED";
    setStatusUpdating(true);
    setError("");
    try {
      await adminApi.patch(`/support/conversations/${encodeURIComponent(selectedId)}/status`, { status: nextStatus });
      await Promise.all([loadMessages(selectedId, { silent: true }), loadConversations({ silent: true })]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not update conversation status.");
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) return <p>Loading support conversations...</p>;

  return (
    <section className="space-y-4">
      <div className="rounded border bg-white p-4">
        <h2 className="text-xl font-bold">Support Conversations</h2>
        <p className="mt-1 text-sm text-slate-600">Handle incoming visitor and organizer support chats.</p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={onSearchSubmit}>
          <select className="rounded border p-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ALL">All</option>
          </select>
          <input
            className="min-w-[220px] flex-1 rounded border p-2 text-sm"
            placeholder="Search name, email, access code, token..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <AppButton type="submit" variant="secondary" className="sm:w-auto">
            Search
          </AppButton>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px,1fr]">
        <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded border bg-white p-3">
          {items.length ? (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded border p-3 text-left ${selectedId === item.id ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{item.displayName || item.email || "Anonymous visitor"}</p>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${item.status === "OPEN" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.email || "No email"}{item.accessCode ? ` | ${item.accessCode}` : ""}</p>
                <p className="mt-1 text-xs text-slate-500">Last activity: {formatDate(item.lastMessageAt)}</p>
                {item.unreadVisitorMessages ? (
                  <p className="mt-1 text-xs font-semibold text-indigo-700">{item.unreadVisitorMessages} unread visitor messages</p>
                ) : null}
                {item.latestMessage?.message ? <p className="mt-2 line-clamp-2 text-xs text-slate-600">{item.latestMessage.message}</p> : null}
              </button>
            ))
          ) : (
            <p className="p-2 text-sm text-slate-500">No conversations found.</p>
          )}
        </div>

        <div className="rounded border bg-white p-4">
          {!activeConversation ? (
            <p className="text-sm text-slate-500">Select a conversation.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{activeConversation.displayName || activeConversation.email || "Anonymous visitor"}</p>
                  <p className="text-xs text-slate-500">
                    {activeConversation.email || "No email"}
                    {activeConversation.accessCode ? ` | Access code: ${activeConversation.accessCode}` : ""}
                    {activeConversation.event?.eventName ? ` | Event: ${activeConversation.event.eventName}` : ""}
                  </p>
                </div>
                <AppButton variant="secondary" onClick={toggleStatus} loading={statusUpdating} loadingText="Updating..." className="sm:w-auto">
                  Mark as {activeConversation.status === "CLOSED" ? "Open" : "Closed"}
                </AppButton>
              </div>

              <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto rounded border bg-slate-50 p-3">
                {messages.length ? (
                  messages.map((item) => {
                    const isAdmin = item.senderType === "ADMIN";
                    return (
                      <div key={item.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[90%] rounded px-3 py-2 text-sm ${isAdmin ? "bg-slate-900 text-white" : "bg-white border text-slate-900"}`}>
                          <p>{item.message}</p>
                          {item.evidenceImageDataUrl ? (
                            <a className="mt-2 block" href={item.evidenceImageDataUrl} target="_blank" rel="noreferrer">
                              <img src={item.evidenceImageDataUrl} alt="Support evidence" className="h-24 w-24 rounded border object-cover" />
                            </a>
                          ) : null}
                          <p className={`mt-1 text-[11px] ${isAdmin ? "text-slate-300" : "text-slate-500"}`}>{formatDate(item.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500">No messages yet.</p>
                )}
              </div>

              <div className="mt-3 grid gap-2">
                <textarea
                  className="min-h-[110px] w-full rounded border p-2"
                  placeholder={activeConversation.status === "CLOSED" ? "Conversation is closed." : "Reply to visitor..."}
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  disabled={activeConversation.status === "CLOSED"}
                />
                <input className="w-full rounded border p-2 text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAttachImage} />
                {pendingImageDataUrl ? <img src={pendingImageDataUrl} alt="Attachment preview" className="h-24 w-24 rounded border object-cover" /> : null}
                <AppButton onClick={sendMessage} loading={sending} loadingText="Sending..." disabled={activeConversation.status === "CLOSED"}>
                  Send Reply
                </AppButton>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
