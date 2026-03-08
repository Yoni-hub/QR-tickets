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
      setFeedback({ kind: "success", message: "Access code generated." });
    } catch (requestError) {
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || "Could not generate access code.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold sm:text-3xl">QR Tickets</h1>
      <p className="mt-3 text-slate-700">
        Create QR tickets, print your tickets, send ticket links via email, or post your event on social media.
        You do not need to sign up or register.
      </p>

      <AppButton className="mt-5" onClick={getStarted} loading={loading} loadingText="Starting...">
        Get Started
      </AppButton>

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      {result?.accessCode ? (
        <section className="mt-6 rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Event access code</p>
          <p className="break-all text-3xl font-bold tracking-wider">{result.accessCode}</p>
          <p className="mt-2 text-sm text-blue-700">
            Access code generated. Go to Dashboard to manage tickets and choose delivery methods.
          </p>
          <p className="mt-2 text-sm text-amber-700">
            Save this code now. It is important. Do not share it with anyone. You will use it to access the event dashboard and scanner.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <AppButton variant="indigo" onClick={() => navigate(`/dashboard?code=${result.accessCode}`)}>
              Go to Dashboard
            </AppButton>
          </div>
        </section>
      ) : null}
    </main>
  );
}
