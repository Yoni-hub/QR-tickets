import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";

function parseCsvRows(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

export default function DashboardTicketRequestsPage() {
  const [params] = useSearchParams();
  const accessCode = useMemo(() => String(params.get("code") || "").trim(), [params]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [guestForm, setGuestForm] = useState({ name: "", phone: "", email: "", quantity: 1, promoterId: "" });
  const [promoters, setPromoters] = useState([]);
  const [csvText, setCsvText] = useState("");
  const [chatContext, setChatContext] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [evidencePreview, setEvidencePreview] = useState("");
  const [approvingRequestIds, setApprovingRequestIds] = useState(() => new Set());

  const load = async () => {
    if (!accessCode) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    try {
      const [requestRes, promoterRes] = await Promise.all([
        api.get(`/events/by-code/${encodeURIComponent(accessCode)}/ticket-requests`),
        api.get(`/events/by-code/${encodeURIComponent(accessCode)}/promoters`),
      ]);
      setItems(requestRes.data.items || []);
      setPromoters(promoterRes.data.items || []);
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not load ticket requests." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [accessCode]);

  const approve = async (id) => {
    const requestItem = items.find((item) => item.id === id);
    if (requestItem?.status === "APPROVED") {
      setFeedback({ kind: "info", message: "request already approved" });
      return;
    }
    if (approvingRequestIds.has(id)) return;

    setApprovingRequestIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      await api.post(`/ticket-requests/${encodeURIComponent(id)}/approve`, { accessCode });
      setFeedback({ kind: "success", message: "Request approved and ticket Assigned to client." });
      await load();
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Approve failed." });
    } finally {
      setApprovingRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const loadChatMessages = async (requestId, { silent = false } = {}) => {
    if (!requestId || !accessCode) return;
    if (!silent) setChatLoading(true);
    try {
      const response = await api.get(`/ticket-requests/${encodeURIComponent(requestId)}/messages`, {
        params: { accessCode },
      });
      setChatMessages(response.data.messages || []);
      setItems((prev) => prev.map((item) => (item.id === requestId ? { ...item, unreadClientMessages: 0 } : item)));
    } catch (requestError) {
      if (!silent) {
        setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not load chat." });
      }
    } finally {
      if (!silent) setChatLoading(false);
    }
  };

  const openChat = async (item) => {
    setChatContext(item);
    setChatInput("");
    await loadChatMessages(item.id);
  };

  const closeChat = () => {
    setChatContext(null);
    setChatInput("");
    setChatMessages([]);
  };

  const sendChatMessage = async () => {
    const requestId = chatContext?.id;
    const message = String(chatInput || "").trim();
    if (!requestId || !message || chatSending) return;

    setChatSending(true);
    try {
      await api.post(`/ticket-requests/${encodeURIComponent(requestId)}/messages`, { accessCode, message });
      setChatInput("");
      await loadChatMessages(requestId, { silent: true });
      await load();
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not send message." });
    } finally {
      setChatSending(false);
    }
  };

  useEffect(() => {
    if (!chatContext?.id || !accessCode) return undefined;
    const interval = setInterval(() => loadChatMessages(chatContext.id, { silent: true }), 8000);
    return () => clearInterval(interval);
  }, [chatContext?.id, accessCode]);

  const addGuest = async () => {
    if (!guestForm.name.trim()) {
      setFeedback({ kind: "error", message: "Guest name is required." });
      return;
    }

    try {
      await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/guests`, {
        accessCode,
        ...guestForm,
      });
      setGuestForm({ name: "", phone: "", email: "", quantity: 1, promoterId: "" });
      setFeedback({ kind: "success", message: "Guest added and approved instantly." });
      await load();
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not add guest." });
    }
  };

  const runBulkImport = async () => {
    const rows = parseCsvRows(csvText);
    if (!rows.length) {
      setFeedback({ kind: "error", message: "CSV data is empty or invalid." });
      return;
    }

    try {
      const response = await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/guests/bulk`, {
        accessCode,
        rows,
      });
      setFeedback({ kind: "success", message: `Bulk import done. Created: ${response.data.created}, Failed: ${response.data.failed}.` });
      await load();
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Bulk import failed." });
    }
  };

  const openEvidenceImage = (dataUrl) => {
    const value = String(dataUrl || "").trim();
    if (!value) return;
    setEvidencePreview(value);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Ticket Requests</h1>
      <p className="mt-2 text-slate-600">Access code: <span className="font-mono">{accessCode || "(missing code)"}</span></p>
      <p className="mt-1 text-sm"><Link className="text-blue-700" to={`/dashboard/promoters?code=${encodeURIComponent(accessCode)}`}>Go to Promoters</Link></p>

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      <section className="mt-4 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Requests</h2>
        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const isApproved = item.status === "APPROVED";
            const isApproving = approvingRequestIds.has(item.id);
            return (
              <article key={item.id} className="rounded border p-3 text-sm">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1">Quantity: {item.quantity}</p>
                <p className="mt-1">Promoter: {item.promoter?.name || "-"}</p>
                <p className="mt-1">Status: {item.status}</p>
                <p className="mt-1">
                  Evidence:{" "}
                  {item.evidenceImageDataUrl ? (
                    <button className="text-blue-700 underline" onClick={() => openEvidenceImage(item.evidenceImageDataUrl)}>View</button>
                  ) : (
                    "-"
                  )}
                </p>
                {item.organizerMessage ? <p className="mt-1 text-xs text-slate-600">Message: {item.organizerMessage}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <AppButton
                    className={`px-2 py-1 text-xs ${isApproved ? "opacity-70" : ""}`}
                    variant={isApproved ? "secondary" : "success"}
                    onClick={() => approve(item.id)}
                    loading={isApproving}
                    loadingText="Approving..."
                  >
                    {isApproved ? "Approved" : "Approve"}
                  </AppButton>
                  <AppButton className="px-2 py-1 text-xs" variant="secondary" onClick={() => openChat(item)}>
                    Message buyer{item.unreadClientMessages ? ` (${item.unreadClientMessages})` : ""}
                  </AppButton>
                </div>
              </article>
            );
          })}
          {!items.length ? <p className="text-sm text-slate-500">No ticket requests yet.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Add Guest</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className="rounded border p-2" placeholder="Name" value={guestForm.name} onChange={(e) => setGuestForm((prev) => ({ ...prev, name: e.target.value }))} />
          <input className="rounded border p-2" placeholder="Phone" value={guestForm.phone} onChange={(e) => setGuestForm((prev) => ({ ...prev, phone: e.target.value }))} />
          <input className="rounded border p-2" placeholder="Email" value={guestForm.email} onChange={(e) => setGuestForm((prev) => ({ ...prev, email: e.target.value }))} />
          <input className="rounded border p-2" type="number" min={1} value={guestForm.quantity} onChange={(e) => setGuestForm((prev) => ({ ...prev, quantity: Math.max(1, Number.parseInt(e.target.value, 10) || 1) }))} />
          <select className="rounded border p-2" value={guestForm.promoterId} onChange={(e) => setGuestForm((prev) => ({ ...prev, promoterId: e.target.value }))}>
            <option value="">No promoter</option>
            {promoters.map((promoter) => <option key={promoter.id} value={promoter.id}>{promoter.name}</option>)}
          </select>
        </div>
        <AppButton className="mt-3" onClick={addGuest}>Add Guest</AppButton>
      </section>

      <section className="mt-4 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Bulk Import CSV</h2>
        <p className="mt-1 text-xs text-slate-500">Headers: name,tickets,promoter,email,phone</p>
        <textarea
          className="mt-2 w-full rounded border p-2 font-mono text-xs"
          rows={8}
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder={"name,tickets,promoter,email,phone\nJohn Smith,2,mike,john@email.com,1234567890"}
        />
        <AppButton className="mt-3" onClick={runBulkImport} loading={loading} loadingText="Importing...">
          Import CSV
        </AppButton>
      </section>

      {chatContext ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <section className="w-full max-w-xl rounded border bg-white p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Chat with {chatContext.name || "Buyer"}</p>
                <p className="text-xs text-slate-500">{chatContext.email || "No email"}{chatContext.phone ? ` | ${chatContext.phone}` : ""}</p>
              </div>
              <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={closeChat}>Close</AppButton>
            </div>

            <div className="mt-3 h-72 overflow-y-auto rounded border bg-slate-50 p-2">
              {chatLoading ? (
                <p className="text-xs text-slate-500">Loading chat...</p>
              ) : chatMessages.length ? (
                <div className="space-y-2">
                  {chatMessages.map((message) => {
                    const isOrganizer = message.senderType === "ORGANIZER";
                    return (
                      <div key={message.id} className={`flex ${isOrganizer ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded px-2 py-1 text-xs ${isOrganizer ? "bg-indigo-600 text-white" : "bg-white text-slate-900 border"}`}>
                          <p>{message.message}</p>
                          <p className={`mt-1 text-[10px] ${isOrganizer ? "text-indigo-100" : "text-slate-500"}`}>
                            {new Date(message.createdAt).toLocaleString()}
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
                placeholder="Type a message to buyer..."
              />
              <AppButton type="button" className="self-end" onClick={sendChatMessage} loading={chatSending} loadingText="Sending...">
                Send
              </AppButton>
            </div>
          </section>
        </div>
      ) : null}

      {evidencePreview ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center">
          <section className="w-full max-w-4xl rounded border bg-slate-900 p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Payment Evidence</p>
              <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setEvidencePreview("")}>
                Close
              </AppButton>
            </div>
            <div className="flex max-h-[78vh] items-center justify-center overflow-auto rounded bg-black p-2">
              <img src={evidencePreview} alt="Payment evidence" className="max-h-[74vh] w-auto rounded bg-white" />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
