import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function PublicEventPage() {
  const { eventSlug = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventData, setEventData] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", quantity: 1 });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });

  const promoterCode = useMemo(() => String(params.get("ref") || "").trim().toLowerCase(), [params]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get(`/public/events/${encodeURIComponent(eventSlug)}`);
        if (alive) setEventData(response.data);
      } catch (requestError) {
        if (alive) setError(requestError.response?.data?.error || "Could not load event.");
      } finally {
        if (alive) setLoading(false);
      }
    };

    if (eventSlug) load();
    return () => {
      alive = false;
    };
  }, [eventSlug]);

  const submitRequest = async () => {
    if (!form.name.trim()) {
      setFeedback({ kind: "error", message: "Name is required." });
      return;
    }

    setSubmitting(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.post("/public/ticket-request", {
        eventSlug,
        name: form.name,
        phone: form.phone,
        email: form.email,
        quantity: form.quantity,
        promoterCode,
      });

      navigate(`/e/${eventSlug}/confirm`, {
        state: {
          request: response.data.request,
          instructions: response.data.instructions,
        },
      });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Request failed." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="mx-auto max-w-3xl px-4 py-6">Loading event...</main>;
  if (error) return <main className="mx-auto max-w-3xl px-4 py-6 text-red-600">{error}</main>;
  if (!eventData?.event) return <main className="mx-auto max-w-3xl px-4 py-6">Event not found.</main>;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">{eventData.event.eventName}</h1>
      <p className="mt-2 text-slate-600">{formatDate(eventData.event.eventDate)} | {eventData.event.location}</p>
      <p className="mt-1 text-sm">Price: {eventData.event.price ? `$${eventData.event.price}` : "Ask organizer"}</p>
      <p className="mt-1 text-sm">Tickets remaining: {eventData.event.ticketsRemaining}</p>
      {promoterCode ? <p className="mt-1 text-xs text-slate-500">Referral: {promoterCode}</p> : null}

      <section className="mt-5 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Request Tickets</h2>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <input className="rounded border p-2" placeholder="Name (required)" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          <input className="rounded border p-2" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
          <input className="rounded border p-2" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
          <input className="rounded border p-2" type="number" min={1} max={20} value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: Math.max(1, Number.parseInt(e.target.value, 10) || 1) }))} />
        </div>

        <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

        <AppButton className="mt-3" onClick={submitRequest} loading={submitting} loadingText="Submitting...">
          Request Tickets
        </AppButton>
      </section>
    </main>
  );
}