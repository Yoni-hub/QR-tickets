import { useEffect, useState } from "react";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { MAX_EVIDENCE_INPUT_BYTES, optimizeEvidenceDataUrl } from "../lib/evidenceImage";

const HELP_CHAT_TOKEN_KEY = "qr_tickets_help_chat_token";

function resolveRequestErrorMessage(requestError, fallbackMessage) {
  const status = Number(requestError?.response?.status || 0);
  const serverMessage = String(requestError?.response?.data?.error || "").trim();
  if (serverMessage) return serverMessage;
  if (status === 413) return "Request is too large. Remove attachment or use a smaller image.";
  if (!requestError?.response) return "Could not reach support server. Start backend API on http://localhost:4100 and try again.";
  return fallbackMessage;
}

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

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState("faq");
  const [openItems, setOpenItems] = useState(() => new Set());
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", accessCode: "", message: "" });
  const [chatInput, setChatInput] = useState("");
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState("");

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  };

  const loadConversation = async (token, options = {}) => {
    if (!token) return;
    const silent = Boolean(options.silent);
    if (!silent) setChatLoading(true);
    try {
      const response = await api.get(`/public/support/conversations/${encodeURIComponent(token)}/messages`);
      setConversation(response.data.conversation || null);
      setMessages(response.data.messages || []);
      if (!silent) setFeedback({ kind: "", message: "" });
    } catch (requestError) {
      const status = Number(requestError?.response?.status || 0);
      if (status === 404) {
        window.localStorage.removeItem(HELP_CHAT_TOKEN_KEY);
        setConversation(null);
        setMessages([]);
      }
      if (!silent) {
        setFeedback({ kind: "error", message: resolveRequestErrorMessage(requestError, "Could not load support chat.") });
      }
    } finally {
      if (!silent) setChatLoading(false);
    }
  };

  useEffect(() => {
    const token = String(window.localStorage.getItem(HELP_CHAT_TOKEN_KEY) || "").trim();
    if (!token) return;
    loadConversation(token);
  }, []);

  useEffect(() => {
    if (!conversation?.conversationToken) return undefined;
    const interval = setInterval(() => {
      loadConversation(conversation.conversationToken, { silent: true });
    }, 9000);
    return () => clearInterval(interval);
  }, [conversation?.conversationToken]);

  const onAttachImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setFeedback({ kind: "error", message: "Attachment must be an image file." });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_EVIDENCE_INPUT_BYTES) {
      setFeedback({ kind: "error", message: "Image is too large. Maximum upload size is 8MB." });
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await optimizeEvidenceDataUrl(file);
      setPendingImageDataUrl(dataUrl);
      setFeedback({ kind: "success", message: "Image attached." });
    } catch {
      setFeedback({ kind: "error", message: "Could not process image." });
    }
    event.target.value = "";
  };

  const createConversation = async () => {
    const initialMessage = String(form.message || "").trim();
    if (!initialMessage) {
      setFeedback({ kind: "error", message: "Please write your support message." });
      return;
    }

    setSubmitting(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.post("/public/support/conversations", {
        name: form.name,
        email: form.email,
        accessCode: form.accessCode,
        message: initialMessage,
        evidenceImageDataUrl: pendingImageDataUrl || null,
      });
      const nextConversation = response.data.conversation || null;
      setConversation(nextConversation);
      setMessages(response.data.messages || []);
      setForm((prev) => ({ ...prev, message: "" }));
      setPendingImageDataUrl("");
      if (nextConversation?.conversationToken) {
        window.localStorage.setItem(HELP_CHAT_TOKEN_KEY, nextConversation.conversationToken);
      }
      setFeedback({ kind: "success", message: "Support conversation started." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: resolveRequestErrorMessage(requestError, "Could not start support conversation.") });
    } finally {
      setSubmitting(false);
    }
  };

  const sendMessage = async () => {
    const token = conversation?.conversationToken;
    const message = String(chatInput || "").trim();
    if (!token) return;
    if (!message) {
      setFeedback({ kind: "error", message: "Message is required." });
      return;
    }
    setSending(true);
    setFeedback({ kind: "", message: "" });
    try {
      await api.post(`/public/support/conversations/${encodeURIComponent(token)}/messages`, {
        message,
        evidenceImageDataUrl: pendingImageDataUrl || null,
      });
      setChatInput("");
      setPendingImageDataUrl("");
      await loadConversation(token, { silent: true });
    } catch (requestError) {
      setFeedback({ kind: "error", message: resolveRequestErrorMessage(requestError, "Could not send message.") });
    } finally {
      setSending(false);
    }
  };

  const resetConversation = () => {
    window.localStorage.removeItem(HELP_CHAT_TOKEN_KEY);
    setConversation(null);
    setMessages([]);
    setForm({ name: "", email: "", accessCode: "", message: "" });
    setChatInput("");
    setPendingImageDataUrl("");
    setFeedback({ kind: "info", message: "Started a new support draft." });
  };

  const toggleItem = (itemId) => {
    setOpenItems((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
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
      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

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
        <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[320px,1fr]">
          <article className="rounded border bg-white p-4">
            <h2 className="text-lg font-semibold">{conversation ? "Your Support Info" : "Start Support Chat"}</h2>
            <p className="mt-1 text-sm text-slate-600">Share your info so admin can verify your request quickly.</p>

            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded border p-2"
                placeholder="Your name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                disabled={Boolean(conversation)}
              />
              <input
                className="w-full rounded border p-2"
                placeholder="Email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                disabled={Boolean(conversation)}
              />
              <input
                className="w-full rounded border p-2 uppercase"
                placeholder="Access code (optional)"
                value={form.accessCode}
                onChange={(event) => setForm((prev) => ({ ...prev, accessCode: event.target.value.toUpperCase() }))}
                disabled={Boolean(conversation)}
              />
              {!conversation ? (
                <textarea
                  className="min-h-[120px] w-full rounded border p-2"
                  placeholder="Describe your issue..."
                  value={form.message}
                  onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                />
              ) : null}
              <input className="w-full rounded border p-2 text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAttachImage} />
              {pendingImageDataUrl ? <img src={pendingImageDataUrl} alt="Attachment preview" className="h-24 w-24 rounded border object-cover" /> : null}
            </div>

            {!conversation ? (
              <AppButton className="mt-3" onClick={createConversation} loading={submitting} loadingText="Starting...">
                Start Chat
              </AppButton>
            ) : (
              <AppButton className="mt-3" variant="secondary" onClick={resetConversation}>
                Start New Conversation
              </AppButton>
            )}
          </article>

          <article className="rounded border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Support Chat</h2>
              {conversation ? (
                <span className={`rounded px-2 py-1 text-xs font-semibold ${conversation.status === "CLOSED" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {conversation.status}
                </span>
              ) : null}
            </div>

            {chatLoading ? <p className="mt-3 text-sm text-slate-500">Loading chat...</p> : null}

            {!conversation ? (
              <p className="mt-3 text-sm text-slate-500">Start a conversation to message admin support.</p>
            ) : (
              <>
                <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto rounded border bg-slate-50 p-3">
                  {messages.length ? (
                    messages.map((item) => {
                      const isVisitor = item.senderType === "VISITOR";
                      return (
                        <div key={item.id} className={`flex ${isVisitor ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[90%] rounded px-3 py-2 text-sm ${isVisitor ? "bg-slate-900 text-white" : "bg-white text-slate-900 border"}`}>
                            <p>{item.message}</p>
                            {item.evidenceImageDataUrl ? (
                              <a className="mt-2 block" href={item.evidenceImageDataUrl} target="_blank" rel="noreferrer">
                                <img src={item.evidenceImageDataUrl} alt="Attachment" className="h-20 w-20 rounded border object-cover" />
                              </a>
                            ) : null}
                            <p className={`mt-1 text-[11px] ${isVisitor ? "text-slate-300" : "text-slate-500"}`}>{formatDate(item.createdAt)}</p>
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
                    className="min-h-[100px] w-full rounded border p-2"
                    placeholder={conversation.status === "CLOSED" ? "This conversation is closed." : "Write a message to admin..."}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    disabled={conversation.status === "CLOSED"}
                  />
                  <AppButton onClick={sendMessage} loading={sending} loadingText="Sending..." disabled={conversation.status === "CLOSED"}>
                    Send Message
                  </AppButton>
                </div>
              </>
            )}
          </article>
        </section>
      )}
    </section>
  );
}
