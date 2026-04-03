import { useState } from "react";
import api from "../lib/api";

export default function ContactSupportPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // OTP step
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [duplicate, setDuplicate] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!email.trim() || !message.trim()) {
      setError("Please fill in both fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/public/contact/send-otp", { email: email.trim() });
      setOtpStep(true);
      setOtp("");
      setOtpError("");
    } catch (err) {
      if (err.response?.data?.duplicate) {
        setDuplicate(true);
      } else {
        setError(err.response?.data?.error || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndSend = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      setOtpError("Please enter the verification code.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      await api.post("/public/contact", { email: email.trim(), message: message.trim(), otp: otp.trim() });
      setSent(true);
    } catch (err) {
      if (err.response?.data?.duplicate) {
        setDuplicate(true);
        setOtpStep(false);
      } else {
        setOtpError(err.response?.data?.error || "Something went wrong. Please try again.");
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpLoading(true);
    setOtpError("");
    try {
      await api.post("/public/contact/send-otp", { email: email.trim() });
      setOtpError("");
    } catch (err) {
      setOtpError(err.response?.data?.error || "Failed to resend code.");
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Contact Support</h1>
      <p className="mt-2 text-sm text-slate-500">
        Describe your issue and we'll get back to you as soon as possible.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-2xl">✓</p>
          <p className="mt-2 font-semibold text-green-800">Message received</p>
          <p className="mt-1 text-sm text-green-700">
            We've received your message. Our team will respond to you as soon as possible.
          </p>
        </div>
      ) : duplicate ? (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-2xl">📬</p>
          <p className="mt-2 font-semibold text-amber-800">We already received your message</p>
          <p className="mt-1 text-sm text-amber-700">
            If you have follow-up questions, write directly to{" "}
            <a href="mailto:support@connsura.com" className="font-semibold underline">
              support@connsura.com
            </a>
            .
          </p>
        </div>
      ) : otpStep ? (
        <form className="mt-8 space-y-5" onSubmit={handleVerifyAndSend}>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            We sent a 6-digit verification code to <strong>{email.trim()}</strong>. Enter it below to send your message.
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="w-full rounded border border-slate-200 p-3 text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={otpLoading}
              autoFocus
            />
          </div>

          {otpError ? (
            <p className="text-sm text-red-600">{otpError}</p>
          ) : null}

          <button
            type="submit"
            disabled={otpLoading}
            className="w-full rounded bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {otpLoading ? "Verifying…" : "Verify and send message"}
          </button>

          <div className="flex items-center justify-between text-sm text-slate-500">
            <button
              type="button"
              className="text-indigo-600 hover:underline disabled:opacity-50"
              onClick={handleResendOtp}
              disabled={otpLoading}
            >
              Resend code
            </button>
            <button
              type="button"
              className="text-slate-400 hover:underline"
              onClick={() => { setOtpStep(false); setOtp(""); setOtpError(""); }}
              disabled={otpLoading}
            >
              Go back
            </button>
          </div>
        </form>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={handleSendMessage}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Your email</label>
            <input
              type="email"
              className="w-full rounded border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Describe your issue</label>
            <textarea
              className="w-full rounded border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              rows={6}
              placeholder="Tell us what's going on..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
            />
          </div>

          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </main>
  );
}
