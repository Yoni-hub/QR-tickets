import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppButton from "../components/ui/AppButton";
import api from "../lib/api";
import { clientChatApi } from "../features/chat/chatApi";

const FAQ_SECTIONS = [
  {
    title: "General",
    items: [
      {
        question: "What is QR Tickets?",
        answer: (
          <p>QR Tickets is a platform for creating, delivering, and validating QR code tickets for events.</p>
        ),
      },
      {
        question: "Who is it for?",
        answer: (
          <>
            <p>QR Tickets is designed for small and independent event organizers, including:</p>
            <ul className="list-disc pl-5">
              <li>Club and party organizers</li>
              <li>Community event hosts</li>
              <li>Church or school events</li>
              <li>Concert or show promoters</li>
              <li>Workshop or seminar organizers</li>
              <li>Private event planners</li>
            </ul>
          </>
        ),
      },
      {
        question: "Is QR Tickets free?",
        answer: <p>Yes. QR Tickets is currently free to use.</p>,
      },
      {
        question: "Do I need to sign up or create an account?",
        answer: (
          <p>No. QR Tickets does not require signup. Organizer workflows are controlled using an organizer access code.</p>
        ),
      },
    ],
  },
  {
    title: "Organizers",
    items: [
      {
        question: "What is an organizer access code?",
        answer: (
          <p>An organizer access code is your private key used to load and manage your events, generate tickets, and access the scanner.</p>
        ),
      },
      {
        question: "How do I start using QR Tickets?",
        answer: (
          <ol className="list-decimal pl-5">
            <li>Open the <strong>Dashboard</strong></li>
            <li>Generate your <strong>organizer access code</strong></li>
            <li>Create your event and enter the event details</li>
            <li>Design your ticket using the ticket editor</li>
            <li>Generate tickets</li>
            <li>Deliver tickets to buyers and scan them at entry</li>
          </ol>
        ),
      },
      {
        question: "How do I create an event?",
        answer: (
          <>
            <p>Go to <strong>Dashboard → Events</strong> and enter the event details such as name, date, and location.</p>
            <p>Then go to <strong>Dashboard → Tickets</strong>, design your ticket using the visual editor, choose the number of tickets, and click <strong>Generate Tickets</strong>.</p>
          </>
        ),
      },
      {
        question: "How do I deliver tickets to customers?",
        answer: (
          <>
            <p>Tickets can be delivered in several ways:</p>
            <ul className="list-disc pl-5">
              <li>Email ticket links</li>
              <li>PDF downloads</li>
              <li>Public event page where customers can request tickets</li>
            </ul>
          </>
        ),
      },
      {
        question: "How do I take payments?",
        answer: (
          <>
            <p>Buyers pay you directly using the payment method you choose.</p>
            <p>QR Tickets does <strong>not process payments</strong>. We only provide ticket generation, delivery, and scanning.</p>
          </>
        ),
      },
      {
        question: "I lost my organizer access code. What should I do?",
        answer: (
          <p>Contact support and be ready to answer verification questions about your event so we can help locate your account.</p>
        ),
      },
    ],
  },
  {
    title: "Ticket Buyers",
    items: [
      {
        question: "How can buyers view their ticket or request status?",
        answer: (
          <>
            <p>When buyers request tickets through a public event page, they receive a <strong>client access code</strong>.</p>
            <p>They can use this code to open their <strong>client dashboard</strong>, where they can:</p>
            <ul className="list-disc pl-5">
              <li>View their ticket status</li>
              <li>Check request updates</li>
              <li>Chat with the organizer</li>
            </ul>
          </>
        ),
      },
      {
        question: "How do I know if the event is real?",
        answer: (
          <>
            <p>Before making a payment:</p>
            <ul className="list-disc pl-5">
              <li>Make sure you <strong>know and trust the organizer</strong></li>
              <li>Verify the <strong>event link comes from the organizer’s official page or account</strong></li>
              <li>Do your own research to confirm the event is legitimate</li>
            </ul>
            <p>QR Tickets only provides the system for <strong>ticket generation, delivery, and validation</strong>.</p>
            <p>We <strong>do not process payments</strong>. All payments are made directly to the organizer.</p>
          </>
        ),
      },
      {
        question: "I paid but didn’t receive my ticket. What should I do?",
        answer: (
          <>
            <p>Contact the <strong>event organizer directly</strong> regarding payment or ticket delivery.</p>
            <p>QR Tickets only provides the platform for <strong>creating, sending, and scanning tickets</strong>.</p>
            <p>We <strong>do not handle payments</strong>, and all payments are made directly to the organizer.</p>
          </>
        ),
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        question: "Can I send images in support chat?",
        answer: (
          <p>Yes. Both you and the admin can attach images (PNG, JPEG, WEBP) when using the support chat.</p>
        ),
      },
    ],
  },
];

const STORAGE_KEYS = {
  organizer: { token: "qr-recovery:organizer:token", conv: "qr-recovery:organizer:conversationId" },
  client: { token: "qr-recovery:client:token", conv: "qr-recovery:client:conversationId" },
};

function getStoredSession(type) {
  const keys = STORAGE_KEYS[type];
  const token = localStorage.getItem(keys.token);
  const conversationId = localStorage.getItem(keys.conv);
  return token && conversationId ? { token, conversationId } : null;
}

export default function HelpPage() {
  const [searchParams] = useSearchParams();
  const isRecovery = searchParams.get("recovery") === "1";
  const roleParam = searchParams.get("role"); // "customer" → jump straight to client recovery
  const [activeTab, setActiveTab] = useState(isRecovery || roleParam ? "support" : "faq");
  const [openItems, setOpenItems] = useState(() => new Set());

  const [role, setRole] = useState(() => {
    if (isRecovery || roleParam === "customer") return "recovery";
    return null;
  });
  const [recoveryType, setRecoveryType] = useState(() => roleParam === "customer" ? "client" : "organizer");

  // recovery session — separate per type so organizer and client sessions don't collide
  const [recoverySession, setRecoverySession] = useState(() => getStoredSession(roleParam === "customer" ? "client" : "organizer"));

  // sync session when recoveryType changes
  useEffect(() => {
    setRecoverySession(getStoredSession(recoveryType));
    setMessages([]);
    setRecoveryError("");
  }, [recoveryType]); // eslint-disable-line react-hooks/exhaustive-deps

  // new request form
  const [recoveryForm, setRecoveryForm] = useState({ name: "", eventName: "", description: "" });
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  // token entry for returning users on a different device
  const [tokenEntry, setTokenEntry] = useState("");
  const [tokenEntryError, setTokenEntryError] = useState("");
  const [tokenEntryLoading, setTokenEntryLoading] = useState(false);

  // chat thread
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatAttachment, setChatAttachment] = useState(null); // File | null
  const [copiedToken, setCopiedToken] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const toggleItem = (itemId) => {
    setOpenItems((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const loadMessages = async (session) => {
    try {
      const res = await clientChatApi.listMessages(session.token, session.conversationId);
      setMessages(res.data?.messages || []);
    } catch {
      // silent — will retry on next poll
    }
  };

  // poll messages while chat is open
  useEffect(() => {
    if (!recoverySession || role !== "recovery") return;
    loadMessages(recoverySession);
    const interval = setInterval(() => loadMessages(recoverySession), 8000);
    return () => clearInterval(interval);
  }, [recoverySession, role, recoveryType]); // eslint-disable-line react-hooks/exhaustive-deps

  // scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const saveSession = (token, conversationId) => {
    const keys = STORAGE_KEYS[recoveryType];
    localStorage.setItem(keys.token, token);
    localStorage.setItem(keys.conv, conversationId);
    return { token, conversationId };
  };

  const handleRecoverySubmit = async () => {
    const { name, eventName, description } = recoveryForm;
    if (!name.trim() || !eventName.trim()) {
      setRecoveryError(`Please fill in your ${recoveryType === "organizer" ? "organizer" : "buyer"} name and event name.`);
      return;
    }
    setRecoverySubmitting(true);
    setRecoveryError("");
    try {
      const prefix = recoveryType === "organizer"
        ? "ORGANIZER ACCESS CODE RECOVERY REQUEST"
        : "CLIENT ACCESS TOKEN RECOVERY REQUEST";
      const nameLabel = recoveryType === "organizer" ? "Organizer name" : "Buyer name";
      const lines = [
        prefix,
        "",
        `${nameLabel}: ${name.trim()}`,
        `Event name: ${eventName.trim()}`,
      ];
      if (description.trim()) lines.push("", `Additional info: ${description.trim()}`);
      const subject = recoveryType === "organizer"
        ? `Organizer Recovery: ${name.trim()}`
        : `Client Recovery: ${name.trim()}`;
      const res = await api.post("/public/support/conversations", {
        name: name.trim(),
        message: lines.join("\n"),
        subject,
      });
      const token = res.data?.conversation?.conversationToken;
      const conversationId = res.data?.conversation?.id;
      if (!token || !conversationId) throw new Error("Invalid response");
      const session = saveSession(token, conversationId);
      setRecoverySession(session);
      setMessages(res.data?.messages || []);
    } catch {
      setRecoveryError("Could not send your request. Please try again.");
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleLoadByToken = async () => {
    const token = tokenEntry.trim();
    if (!token) return;
    setTokenEntryLoading(true);
    setTokenEntryError("");
    try {
      const res = await clientChatApi.listConversations(token);
      const conversation = (res.data?.conversations || [])[0];
      if (!conversation) {
        setTokenEntryError("Recovery token not found. Check and try again.");
        return;
      }
      const session = saveSession(token, conversation.id);
      setRecoverySession(session);
      const msgRes = await clientChatApi.listMessages(token, conversation.id);
      setMessages(msgRes.data?.messages || []);
    } catch {
      setTokenEntryError("Could not load recovery request. Check your token and try again.");
    } finally {
      setTokenEntryLoading(false);
    }
  };

  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text && !chatAttachment) return;
    if (!recoverySession) return;
    setChatSending(true);
    try {
      await clientChatApi.sendMessage(recoverySession.token, recoverySession.conversationId, { message: text, attachment: chatAttachment || undefined });
      setChatInput("");
      setChatAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMessages(recoverySession);
    } catch {
      // silent
    } finally {
      setChatSending(false);
    }
  };

  const handleCopyToken = () => {
    if (!recoverySession) return;
    navigator.clipboard.writeText(recoverySession.token).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  };

  const handleClearSession = () => {
    const keys = STORAGE_KEYS[recoveryType];
    localStorage.removeItem(keys.token);
    localStorage.removeItem(keys.conv);
    setRecoverySession(null);
    setMessages([]);
    setRecoveryForm({ name: "", eventName: "", description: "" });
  };

  return (
    <section className="faq-page mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="text-3xl font-bold">FAQ</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <AppButton variant={activeTab === "faq" ? "primary" : "secondary"} onClick={() => setActiveTab("faq")} className="sm:w-auto">
          FAQ
        </AppButton>
        <AppButton variant={activeTab === "support" ? "primary" : "secondary"} onClick={() => setActiveTab("support")} className="sm:w-auto">
          Support
        </AppButton>
      </div>
      {activeTab === "faq" ? (
        <div className="mt-5 space-y-6">
          {FAQ_SECTIONS.map((section) => (
            <div key={section.title} className="faq-section">
              <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>

              <div className="space-y-2">
                {section.items.map((item) => {
                  const itemId = `${section.title}:${item.question}`;
                  const isOpen = openItems.has(itemId);
                  return (
                    <div key={itemId} className="faq-item rounded border bg-white">
                      <button
                        type="button"
                        className="faq-question flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        onClick={() => toggleItem(itemId)}
                        aria-expanded={isOpen}
                      >
                        <strong className="text-base">{item.question}</strong>
                        <span className="text-slate-500">{isOpen ? "−" : "+"}</span>
                      </button>
                      {isOpen ? (
                        <div className="faq-answer border-t px-4 py-3">
                          <div className="space-y-2 pl-3 text-sm text-slate-700">{item.answer}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section className="mt-5 max-w-lg">
          {role === null ? (
            <div className="rounded border bg-white p-6">
              <h2 className="text-lg font-semibold">Who are you?</h2>
              <p className="mt-1 text-sm text-slate-600">Select your role so we can point you in the right direction.</p>
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  className="rounded border-2 border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-900 hover:bg-slate-50"
                  onClick={() => setRole("organizer")}
                >
                  <p className="font-semibold">I am an organizer</p>
                  <p className="mt-0.5 text-sm text-slate-500">I create and manage events using QR Tickets.</p>
                </button>
                <button
                  type="button"
                  className="rounded border-2 border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-900 hover:bg-slate-50"
                  onClick={() => setRole("customer")}
                >
                  <p className="font-semibold">I am a ticket buyer</p>
                  <p className="mt-0.5 text-sm text-slate-500">I bought or requested a ticket for an event.</p>
                </button>
                <button
                  type="button"
                  className="rounded border-2 border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-900 hover:bg-slate-50"
                  onClick={() => setRole("visitor")}
                >
                  <p className="font-semibold">I am new here / just browsing</p>
                  <p className="mt-0.5 text-sm text-slate-500">I have general questions about QR Tickets.</p>
                </button>
              </div>
            </div>
          ) : null}

          {role === "organizer" ? (
            <div className="rounded border bg-white p-6">
              <h2 className="text-lg font-semibold">Go to your Organizer Dashboard</h2>
              <p className="mt-2 text-sm text-slate-600">
                As an organizer, support and chat with admin are available directly inside your dashboard.
              </p>
              <ol className="mt-4 list-decimal pl-5 space-y-1 text-sm text-slate-700">
                <li>Open your <strong>Organizer Dashboard</strong></li>
                <li>Enter your <strong>organizer access code</strong> to load your account</li>
                <li>Go to the <strong>Chat</strong> menu to message admin directly</li>
              </ol>
              <Link to="/dashboard" className="mt-5 inline-block rounded bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
                Open Organizer Dashboard
              </Link>
              <div className="mt-4 flex flex-wrap gap-4">
                <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => setRole(null)}>
                  Back
                </button>
                <button type="button" className="text-sm text-red-600 underline hover:text-red-800" onClick={() => { setRecoveryType("organizer"); setRole("recovery"); }}>
                  I lost my access code
                </button>
              </div>
            </div>
          ) : null}

          {role === "customer" ? (
            <div className="rounded border bg-white p-6">
              <h2 className="text-lg font-semibold">Go to your Client Dashboard</h2>
              <p className="mt-2 text-sm text-slate-600">
                As a ticket buyer, your dashboard is where you can view your tickets, check request status, and chat with the organizer or admin.
              </p>
              <ol className="mt-4 list-decimal pl-5 space-y-1 text-sm text-slate-700">
                <li>Open your <strong>Client Dashboard</strong></li>
                <li>Enter your <strong>client access token</strong> — it was sent to you when you requested a ticket</li>
                <li>Go to the <strong>Chat</strong> menu to message the organizer or admin</li>
              </ol>
              <Link to="/client" className="mt-5 inline-block rounded bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
                Open Client Dashboard
              </Link>
              <div className="mt-4 flex flex-wrap gap-4">
                <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => setRole(null)}>
                  Back
                </button>
                <button type="button" className="text-sm text-red-600 underline hover:text-red-800" onClick={() => { setRecoveryType("client"); setRole("recovery"); }}>
                  I lost my client access token
                </button>
              </div>
            </div>
          ) : null}

          {role === "visitor" ? (
            <div className="rounded border bg-white p-6">
              <h2 className="text-lg font-semibold">Check the FAQ</h2>
              <p className="mt-2 text-sm text-slate-600">
                For general questions about how QR Tickets works, our FAQ section covers the most common topics including getting started, how events work, and what ticket buyers can expect.
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Direct support chat is only available for registered organizers and ticket buyers with an active token.
              </p>
              <button
                type="button"
                className="mt-5 inline-block rounded bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
                onClick={() => setActiveTab("faq")}
              >
                Browse FAQ
              </button>
              <div className="mt-4">
                <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => setRole(null)}>
                  Back
                </button>
              </div>
            </div>
          ) : null}

          {role === "recovery" ? (
            <div className="rounded border bg-white p-6">
              <h2 className="text-lg font-semibold">
                {recoveryType === "organizer" ? "Organizer Access Code Recovery" : "Client Access Token Recovery"}
              </h2>

              {recoverySession ? (
                /* ── CHAT THREAD ── */
                <>
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-800">Your recovery token — save this on another device</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-800">{recoverySession.token}</code>
                      <button
                        type="button"
                        className="shrink-0 rounded border px-2 py-1 text-xs font-semibold hover:bg-amber-100"
                        onClick={handleCopyToken}
                      >
                        {copiedToken ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-amber-700">Your {recoveryType === "organizer" ? "access code" : "client access token"} will only be shared here — never by email or phone.</p>
                  </div>

                  <div className="mt-4 flex max-h-72 flex-col gap-2 overflow-y-auto rounded border bg-slate-50 p-3">
                    {messages.length === 0 ? (
                      <p className="text-center text-xs text-slate-400">Waiting for admin response…</p>
                    ) : null}
                    {messages.map((msg) => {
                      const isAdmin = msg.senderType === "ADMIN";
                      const images = (msg.attachments || []).filter((a) => String(a.contentType || "").startsWith("image/"));
                      return (
                        <div key={msg.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[80%] rounded px-3 py-2 text-sm ${isAdmin ? "bg-white text-slate-800 shadow-sm" : "bg-slate-900 text-white"}`}>
                            {isAdmin ? <p className="mb-1 text-xs font-semibold text-slate-400">Admin</p> : null}
                            {msg.message ? <p className="whitespace-pre-wrap">{msg.message}</p> : null}
                            {images.map((att) => (
                              <a key={att.id} href={att.downloadUrl} target="_blank" rel="noreferrer" className="mt-1 block">
                                <img src={att.downloadUrl} alt="attachment" className="max-h-48 rounded object-contain" />
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {chatAttachment ? (
                    <div className="mt-3 flex items-center gap-2 rounded border bg-slate-50 px-3 py-2 text-sm">
                      <img
                        src={URL.createObjectURL(chatAttachment)}
                        alt="attachment preview"
                        className="h-14 w-14 rounded object-cover"
                      />
                      <span className="flex-1 truncate text-slate-600">{chatAttachment.name}</span>
                      <button type="button" className="text-xs text-red-500 hover:text-red-700" onClick={() => { setChatAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setChatAttachment(e.target.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      title="Attach image"
                      className="rounded border px-2 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                    <input
                      className="flex-1 rounded border p-2 text-sm"
                      placeholder="Reply to admin…"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                    />
                    <AppButton variant="primary" onClick={handleChatSend} loading={chatSending} loadingText="…">
                      Send
                    </AppButton>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => setRole(null)}>
                      Back
                    </button>
                    <button type="button" className="text-sm text-red-600 underline hover:text-red-800" onClick={handleClearSession}>
                      Start a new recovery request
                    </button>
                  </div>
                </>
              ) : (
                /* ── FORM + TOKEN ENTRY ── */
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Fill in the details below. Our admin team will verify your identity before sharing your{" "}
                    {recoveryType === "organizer" ? "access code" : "client access token"}.
                    The more details you provide, the faster we can verify you.
                  </p>
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    For your security: your {recoveryType === "organizer" ? "access code" : "client access token"} will only be shared via this private support chat — never by email or phone.
                  </p>
                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700">
                        {recoveryType === "organizer" ? "Your organizer name" : "Your name"} <span className="text-red-500">*</span>
                      </label>
                      <input
                        className="mt-1 w-full rounded border p-2 text-sm"
                        placeholder={recoveryType === "organizer" ? "Name or brand you used when creating your account" : "Name you used when requesting the ticket"}
                        value={recoveryForm.name}
                        onChange={(e) => setRecoveryForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700">
                        {recoveryType === "organizer" ? "Event name" : "Event you bought a ticket for"} <span className="text-red-500">*</span>
                      </label>
                      <input
                        className="mt-1 w-full rounded border p-2 text-sm"
                        placeholder={recoveryType === "organizer" ? "Name of at least one event you created" : "Name of the event you requested a ticket for"}
                        value={recoveryForm.eventName}
                        onChange={(e) => setRecoveryForm((p) => ({ ...p, eventName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700">Additional details</label>
                      <textarea
                        className="mt-1 w-full rounded border p-2 text-sm"
                        rows={3}
                        placeholder={recoveryType === "organizer"
                          ? "Approximate event date, number of tickets sold, buyer names — anything that proves you own this account"
                          : "Approximate date you requested the ticket, payment amount, organizer name — anything that confirms your identity"}
                        value={recoveryForm.description}
                        onChange={(e) => setRecoveryForm((p) => ({ ...p, description: e.target.value }))}
                      />
                    </div>
                    {recoveryError ? <p className="text-sm text-red-600">{recoveryError}</p> : null}
                    <AppButton variant="primary" onClick={handleRecoverySubmit} loading={recoverySubmitting} loadingText="Sending…" className="w-full sm:w-auto">
                      Send Recovery Request
                    </AppButton>
                  </div>

                  <div className="mt-6 border-t pt-4">
                    <p className="text-sm font-semibold text-slate-700">Already submitted a request?</p>
                    <p className="mt-1 text-xs text-slate-500">Enter your recovery token to continue the conversation.</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="flex-1 rounded border p-2 font-mono text-sm"
                        placeholder="Paste your recovery token"
                        value={tokenEntry}
                        onChange={(e) => setTokenEntry(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLoadByToken()}
                      />
                      <AppButton variant="secondary" onClick={handleLoadByToken} loading={tokenEntryLoading} loadingText="…">
                        Load
                      </AppButton>
                    </div>
                    {tokenEntryError ? <p className="mt-1 text-sm text-red-600">{tokenEntryError}</p> : null}
                  </div>

                  <div className="mt-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => setRole(recoveryType === "organizer" ? "organizer" : "customer")}>
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </section>
      )}
    </section>
  );
}
