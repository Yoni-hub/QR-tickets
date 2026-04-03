import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppButton from "../components/ui/AppButton";
import api from "../lib/api";

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
        answer: <><p>If you don't sell tickets, you pay nothing.</p><p className="mt-1">You only pay $0.99 per ticket — after it's sold.</p></>,
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
          <p>Tickets can be delivered via the public event page where customers can request tickets.</p>
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
          <p>Go to the <strong>Help → Support</strong> tab and click <strong>"I lost my access code"</strong>. Enter the notification email you set up in your dashboard — we'll send a verification code and email you your access code automatically. If you never set up a notification email, contact admin via your dashboard chat.</p>
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
];


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

  // automated organizer code recovery
  const [orgRecoveryStep, setOrgRecoveryStep] = useState("email"); // "email" | "otp" | "done"
  const [orgRecoveryEmail, setOrgRecoveryEmail] = useState("");
  const [orgRecoveryCode, setOrgRecoveryCode] = useState("");
  const [orgRecoverySubmitting, setOrgRecoverySubmitting] = useState(false);
  const [orgRecoveryError, setOrgRecoveryError] = useState("");

  // automated client token recovery
  const [clientRecoveryStep, setClientRecoveryStep] = useState("email"); // "email" | "otp" | "done"
  const [clientRecoveryEmail, setClientRecoveryEmail] = useState("");
  const [clientRecoveryCode, setClientRecoveryCode] = useState("");
  const [clientRecoverySubmitting, setClientRecoverySubmitting] = useState(false);
  const [clientRecoveryError, setClientRecoveryError] = useState("");

  const toggleItem = (itemId) => {
    setOpenItems((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleOrgRecoverySendOtp = async () => {
    const email = orgRecoveryEmail.trim().toLowerCase();
    if (!email) { setOrgRecoveryError("Please enter your email address."); return; }
    setOrgRecoverySubmitting(true);
    setOrgRecoveryError("");
    try {
      await api.post("/public/recover-organizer-code/send-otp", { email });
      setOrgRecoveryStep("otp");
      setOrgRecoveryCode("");
    } catch {
      setOrgRecoveryError("Could not send verification code. Please try again.");
    } finally {
      setOrgRecoverySubmitting(false);
    }
  };

  const handleOrgRecoveryConfirm = async () => {
    const code = orgRecoveryCode.trim();
    if (!code) { setOrgRecoveryError("Please enter the verification code."); return; }
    setOrgRecoverySubmitting(true);
    setOrgRecoveryError("");
    try {
      await api.post("/public/recover-organizer-code/confirm", { email: orgRecoveryEmail.trim().toLowerCase(), code });
      setOrgRecoveryStep("done");
    } catch (err) {
      setOrgRecoveryError(err.response?.data?.error || "Verification failed. Please try again.");
    } finally {
      setOrgRecoverySubmitting(false);
    }
  };

  const handleOrgRecoveryBack = () => {
    setOrgRecoveryStep("email");
    setOrgRecoveryCode("");
    setOrgRecoveryError("");
  };

  const handleClientRecoverySendOtp = async () => {
    const email = clientRecoveryEmail.trim().toLowerCase();
    if (!email) {
      setClientRecoveryError("Please enter your email address.");
      return;
    }
    setClientRecoverySubmitting(true);
    setClientRecoveryError("");
    try {
      await api.post("/public/recover-client-token/send-otp", { email });
      setClientRecoveryStep("otp");
      setClientRecoveryCode("");
    } catch {
      setClientRecoveryError("Could not send verification code. Please try again.");
    } finally {
      setClientRecoverySubmitting(false);
    }
  };

  const handleClientRecoveryConfirm = async () => {
    const code = clientRecoveryCode.trim();
    if (!code) {
      setClientRecoveryError("Please enter the verification code.");
      return;
    }
    setClientRecoverySubmitting(true);
    setClientRecoveryError("");
    try {
      await api.post("/public/recover-client-token/confirm", { email: clientRecoveryEmail.trim().toLowerCase(), code });
      setClientRecoveryStep("done");
    } catch (err) {
      setClientRecoveryError(err.response?.data?.error || "Verification failed. Please try again.");
    } finally {
      setClientRecoverySubmitting(false);
    }
  };

  const handleClientRecoveryBack = () => {
    setClientRecoveryStep("email");
    setClientRecoveryCode("");
    setClientRecoveryError("");
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

          {role === "recovery" && recoveryType === "client" ? (
            <div className="rounded border bg-white p-6">
              <h2 className="text-lg font-semibold">Client Access Token Recovery</h2>
              {clientRecoveryStep === "email" ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Enter the email address you used when requesting your ticket. We'll send a verification code to confirm it's you, then email you your dashboard link.
                  </p>
                  <div className="mt-5 space-y-3">
                    <input
                      className="w-full rounded border p-2 text-sm"
                      type="email"
                      placeholder="Email address used for your ticket request"
                      value={clientRecoveryEmail}
                      onChange={(e) => setClientRecoveryEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleClientRecoverySendOtp()}
                    />
                    {clientRecoveryError ? <p className="text-sm text-red-600">{clientRecoveryError}</p> : null}
                    <AppButton onClick={handleClientRecoverySendOtp} loading={clientRecoverySubmitting} loadingText="Sending code…">
                      Send Verification Code
                    </AppButton>
                  </div>
                  <div className="mt-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => setRole("customer")}>
                      Back
                    </button>
                  </div>
                </>
              ) : clientRecoveryStep === "otp" ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Enter the 6-digit code sent to <strong>{clientRecoveryEmail}</strong>.
                  </p>
                  <div className="mt-5 space-y-3">
                    <input
                      className="w-full rounded border p-2 text-center text-xl font-bold tracking-widest"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={clientRecoveryCode}
                      onChange={(e) => setClientRecoveryCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    {clientRecoveryError ? <p className="text-sm text-red-600">{clientRecoveryError}</p> : null}
                    <AppButton onClick={handleClientRecoveryConfirm} loading={clientRecoverySubmitting} loadingText="Verifying…">
                      Verify &amp; Send My Links
                    </AppButton>
                  </div>
                  <div className="mt-4 flex gap-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={handleClientRecoveryBack}>
                      Back
                    </button>
                    <button type="button" className="text-sm text-blue-600 underline hover:text-blue-800" onClick={handleClientRecoverySendOtp}>
                      Resend code
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 p-4">
                    <p className="font-semibold text-emerald-800">Check your inbox</p>
                    <p className="mt-1 text-sm text-emerald-700">
                      If a ticket request was found for <strong>{clientRecoveryEmail}</strong>, we've sent your dashboard link(s) to that address.
                    </p>
                  </div>
                  <div className="mt-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => { setRole(null); setClientRecoveryStep("email"); setClientRecoveryEmail(""); setClientRecoveryError(""); }}>
                      Back to Help
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {role === "recovery" && recoveryType === "organizer" ? (
            <div className="rounded border bg-white p-6">
              <h2 className="text-lg font-semibold">Organizer Access Code Recovery</h2>
              {orgRecoveryStep === "email" ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Enter the notification email you set up in your organizer dashboard. We'll send a verification code, then email you your access code.
                  </p>
                  <p className="mt-2 text-xs text-amber-700 font-medium">
                    Recovery only works if you previously saved a notification email in your dashboard settings.
                  </p>
                  <div className="mt-5 space-y-3">
                    <input
                      className="w-full rounded border p-2 text-sm"
                      type="email"
                      placeholder="Notification email from your dashboard settings"
                      value={orgRecoveryEmail}
                      onChange={(e) => setOrgRecoveryEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleOrgRecoverySendOtp()}
                    />
                    {orgRecoveryError ? <p className="text-sm text-red-600">{orgRecoveryError}</p> : null}
                    <AppButton onClick={handleOrgRecoverySendOtp} loading={orgRecoverySubmitting} loadingText="Sending code…">
                      Send Verification Code
                    </AppButton>
                  </div>
                  <div className="mt-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => setRole("organizer")}>
                      Back
                    </button>
                  </div>
                </>
              ) : orgRecoveryStep === "otp" ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    Enter the 6-digit code sent to <strong>{orgRecoveryEmail}</strong>.
                  </p>
                  <div className="mt-5 space-y-3">
                    <input
                      className="w-full rounded border p-2 text-center text-xl font-bold tracking-widest"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={orgRecoveryCode}
                      onChange={(e) => setOrgRecoveryCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    {orgRecoveryError ? <p className="text-sm text-red-600">{orgRecoveryError}</p> : null}
                    <AppButton onClick={handleOrgRecoveryConfirm} loading={orgRecoverySubmitting} loadingText="Verifying…">
                      Verify &amp; Send My Code
                    </AppButton>
                  </div>
                  <div className="mt-4 flex gap-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={handleOrgRecoveryBack}>
                      Back
                    </button>
                    <button type="button" className="text-sm text-blue-600 underline hover:text-blue-800" onClick={handleOrgRecoverySendOtp}>
                      Resend code
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 p-4">
                    <p className="font-semibold text-emerald-800">Check your inbox</p>
                    <p className="mt-1 text-sm text-emerald-700">
                      If a notification email was found for <strong>{orgRecoveryEmail}</strong>, we've sent your organizer access code to that address.
                    </p>
                  </div>
                  <div className="mt-4">
                    <button type="button" className="text-sm text-slate-500 underline hover:text-slate-800" onClick={() => { setRole(null); setOrgRecoveryStep("email"); setOrgRecoveryEmail(""); setOrgRecoveryError(""); }}>
                      Back to Help
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
