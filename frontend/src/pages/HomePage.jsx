import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [result, setResult] = useState(null);

  const getStarted = async () => {
    if (loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    setResult(null);
    try {
      const response = await withMinDelay(
        api.post("/demo/events", {
          generateAccessOnly: true,
          eventName: "QR Tickets Demo Event",
          eventAddress: "Sample Venue",
          eventDateTime: new Date().toISOString(),
          dateTimeText: new Date().toLocaleString(),
          ticketType: "General",
          ticketPrice: "0",
          quantity: "10",
        }),
      );
      setResult(response.data);
      setFeedback({ kind: "success", message: "Organizer access code generated." });
    } catch (requestError) {
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || "Could not generate organizer access code.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-0 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-slate-200 pb-1 pt-0">
          <img src="/qr-Logo.png" alt="QR Ticket by Connsura" className="-mb-10 mt-0 block h-[10.5rem] w-auto sm:-mb-14 sm:h-48 lg:-mb-20 lg:h-60" />
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#how-it-works" className="transition-colors hover:text-slate-900">
              How It Works
            </a>
          </nav>
        </header>

        <section
          className="relative mt-0 overflow-hidden rounded-3xl px-4 pb-8 pt-5 text-center sm:px-8 sm:pt-7"
          style={{
            backgroundImage:
              "radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(241,245,249,0.82) 58%, rgba(226,232,240,0.86) 100%), radial-gradient(rgba(37,99,235,0.08) 1px, transparent 1px)",
            backgroundSize: "100% 100%, 14px 14px",
          }}
        >
          <h1 className="mx-auto max-w-4xl text-[2.2rem] font-semibold leading-[1.24] text-slate-800 sm:text-[2.45rem]">
            Create QR Code Tickets Instantly
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-normal text-slate-600 sm:text-[1.1rem] sm:leading-[1.55]">
            Create QR tickets, print your tickets, send ticket links via email, or post your event on social media.
            You do not need to sign up or register.
          </p>

          <div className="mt-6 flex justify-center">
            <AppButton
              onClick={getStarted}
              loading={loading}
              loadingText="Starting..."
              className="h-11 min-w-[190px] rounded-lg bg-black px-7 text-[0.95rem] font-semibold text-white shadow-md transition-transform hover:scale-[1.01] hover:bg-slate-900"
            >
              Get Started
            </AppButton>
          </div>

          <FeedbackBanner className="mx-auto mt-3 max-w-xl text-left" kind={feedback.kind} message={feedback.message} />

          {result?.organizerAccessCode ? (
            <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-blue-100 bg-white/95 p-4 text-left shadow-sm">
              <p className="text-sm text-slate-600">Organizer access code</p>
              <p className="break-all text-3xl font-bold tracking-wider text-slate-900">{result.organizerAccessCode}</p>
              <p className="mt-2 text-sm text-blue-700">
                Organizer access code generated. Go to Dashboard to manage your events.
              </p>
              <p className="mt-2 text-sm text-amber-700">
                Save this code now. If you lose it, you cannot recover your events. Do not share it with anyone.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <AppButton variant="indigo" onClick={() => navigate(`/dashboard?code=${encodeURIComponent(result.organizerAccessCode)}`)}>
                  Go to Dashboard
                </AppButton>
              </div>
            </section>
          ) : null}

          <section id="how-it-works" className="mx-auto mt-9 grid max-w-3xl grid-cols-1 gap-4 text-left md:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
              <div className="flex items-start gap-4">
                <img src="/easy-Ticket.png" alt="Easy ticket generation" className="h-32 w-32 shrink-0 rounded-xl object-contain" />
                <div>
                  <h2 className="text-[1.1rem] font-semibold leading-[1.3] text-slate-800">Easy Ticket Generation</h2>
                  <p className="mt-2 text-[0.875rem] font-normal text-slate-600">Quickly create custom QR code tickets.</p>
                </div>
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
              <div className="flex items-start gap-4">
                <img src="/qr_scan.png" alt="Fast QR code scanning" className="h-32 w-32 shrink-0 rounded-xl object-contain" />
                <div>
                  <h2 className="text-[1.1rem] font-semibold leading-[1.3] text-slate-800">Fast QR Code Scanning</h2>
                  <p className="mt-2 text-[0.875rem] font-normal text-slate-600">Instantly scan and verify tickets with your phone.</p>
                </div>
              </div>
            </article>
          </section>

          <section id="support" className="mx-auto mt-7 max-w-5xl text-center text-sm text-slate-500">
            Need help? Support is available from the dashboard once you start your event.
          </section>
        </section>
      </div>
    </main>
  );
}
