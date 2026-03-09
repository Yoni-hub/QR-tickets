import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";

const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export default function PublicEventPage() {
  const { eventSlug = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventData, setEventData] = useState(null);
  const [form, setForm] = useState({ name: "", ticketType: "", quantity: 0 });
  const [quantitiesByType, setQuantitiesByType] = useState({});
  const [evidenceImageDataUrl, setEvidenceImageDataUrl] = useState("");
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

  useEffect(() => {
    const options = eventData?.event?.ticketTypes || [];
    if (!options.length) return;
    const nextQuantities = {};
    for (const option of options) {
      nextQuantities[option.ticketType] = 0;
    }
    setQuantitiesByType(nextQuantities);
    setForm((prev) => ({
      ...prev,
      quantity: 0,
    }));
  }, [eventData]);

  const handleTypeQuantityChange = (ticketType, rawValue) => {
    const parsedQuantity = Math.max(0, Number.parseInt(rawValue, 10) || 0);
    setQuantitiesByType((prev) => ({ ...prev, [ticketType]: parsedQuantity }));
    setForm((prev) => ({
      ...prev,
      ticketType: parsedQuantity > 0 ? ticketType : prev.ticketType,
      quantity: parsedQuantity,
    }));
  };

  const selectedSelections = useMemo(() => {
    const options = eventData?.event?.ticketTypes || [];
    return options
      .map((item) => ({
        ticketType: item.ticketType,
        quantity: Math.max(0, Number(quantitiesByType[item.ticketType] || 0)),
        unitPrice: Number(item.price || 0),
        remaining: Number(item.ticketsRemaining || 0),
      }))
      .filter((item) => item.quantity > 0);
  }, [eventData, quantitiesByType]);
  const totalQuantity = selectedSelections.reduce((sum, item) => sum + item.quantity, 0);
  const finalPrice = selectedSelections.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const allTicketTypesFree = (eventData?.event?.ticketTypes || []).length
    ? (eventData?.event?.ticketTypes || []).every((item) => Number(item.price || 0) <= 0)
    : false;
  const isFreeSelection = totalQuantity > 0 ? finalPrice <= 0 : allTicketTypesFree;

  const onEvidenceFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setFeedback({ kind: "error", message: "Evidence must be an image file." });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      setFeedback({ kind: "error", message: "Evidence image is too large. Maximum size is 2MB." });
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setEvidenceImageDataUrl(dataUrl);
      setFeedback({ kind: "success", message: "Evidence image attached." });
    } catch {
      setFeedback({ kind: "error", message: "Could not read evidence image." });
    }
    event.target.value = "";
  };

  const submitRequest = async () => {
    if (!form.name.trim()) {
      setFeedback({ kind: "error", message: "Name is required." });
      return;
    }
    if (totalQuantity < 1) {
      setFeedback({ kind: "error", message: "Please add quantity for at least one ticket type." });
      return;
    }
    if (!isFreeSelection && !evidenceImageDataUrl) {
      setFeedback({ kind: "error", message: "Payment evidence is required." });
      return;
    }
    for (const selection of selectedSelections) {
      if (selection.quantity > selection.remaining) {
        setFeedback({ kind: "error", message: `Only ${selection.remaining} tickets left for ${selection.ticketType}.` });
        return;
      }
    }

    setSubmitting(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.post("/public/ticket-request", {
        eventSlug,
        name: form.name,
        ticketSelections: selectedSelections.map((item) => ({ ticketType: item.ticketType, quantity: item.quantity })),
        evidenceImageDataUrl: isFreeSelection ? null : evidenceImageDataUrl,
        promoterCode,
      });

      navigate(`/e/${eventSlug}/confirm`, {
        state: {
          request: response.data.request,
          instructions: response.data.instructions,
          payment: response.data.payment,
        },
      });
    } catch (requestError) {
      const responseData = requestError.response?.data;
      const responseMessage =
        typeof responseData === "string"
          ? responseData
          : responseData?.error || requestError.message || "Request failed.";
      setFeedback({ kind: "error", message: responseMessage });
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
      <div className="mt-3 rounded border bg-white p-3 text-sm">
        <p className="font-semibold">Ticket Types</p>
        <div className="mt-2 space-y-2 sm:hidden">
          {(eventData.event.ticketTypes || []).map((item) => (
            <article key={item.ticketType} className="rounded border bg-white p-3 text-sm">
              <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <p>Type</p>
                <p>Price</p>
                <p>Remaining</p>
                <p>Quantity</p>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-2 items-center text-sm text-slate-900">
                <p className="font-medium break-words">{item.ticketType}</p>
                <p>{item.price != null ? `$${Number(item.price).toFixed(2)}` : "Ask organizer"}</p>
                <p>{item.ticketsRemaining}</p>
                <input
                  className="w-full rounded border p-1.5"
                  type="number"
                  min={0}
                  max={Math.max(0, Number(item.ticketsRemaining || 0))}
                  value={quantitiesByType[item.ticketType] ?? 0}
                  onChange={(e) => handleTypeQuantityChange(item.ticketType, e.target.value)}
                  disabled={Number(item.ticketsRemaining || 0) <= 0}
                />
              </div>
            </article>
          ))}
          {!eventData.event.ticketTypes?.length ? <p className="text-slate-500">No ticket types available yet.</p> : null}
        </div>
        <div className="mt-2 hidden overflow-x-auto rounded border sm:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2">Type</th>
                <th className="p-2">Price</th>
                <th className="p-2">Remaining</th>
                <th className="p-2">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {(eventData.event.ticketTypes || []).map((item) => (
                <tr key={item.ticketType} className="border-t">
                  <td className="p-2 font-medium">{item.ticketType}</td>
                  <td className="p-2">{item.price != null ? `$${Number(item.price).toFixed(2)}` : "Ask organizer"}</td>
                  <td className="p-2">{item.ticketsRemaining}</td>
                  <td className="p-2">
                    <input
                      className="w-24 rounded border p-1.5"
                      type="number"
                      min={0}
                      max={Math.max(0, Number(item.ticketsRemaining || 0))}
                      value={quantitiesByType[item.ticketType] ?? 0}
                      onChange={(e) => handleTypeQuantityChange(item.ticketType, e.target.value)}
                      disabled={Number(item.ticketsRemaining || 0) <= 0}
                    />
                  </td>
                </tr>
              ))}
              {!eventData.event.ticketTypes?.length ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={4}>No ticket types available yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {promoterCode ? <p className="mt-1 text-xs text-slate-500">Referral: {promoterCode}</p> : null}

      <section className="mt-5 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Request Tickets</h2>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <input className="rounded border p-2" placeholder="Name (required)" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
        </div>

        {isFreeSelection ? (
          <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-semibold">Total payment: FREE</p>
            <p className="mt-1">Selected tickets: {totalQuantity}</p>
            <p className="mt-1">Payment proof is NOT required. Its a FREE event.</p>
          </div>
        ) : (
          <>
            <div className="mt-3 rounded border bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Total payment: ${finalPrice.toFixed(2)}</p>
              <p className="mt-1">Selected tickets: {totalQuantity}</p>
              <p className="mt-1">Organizer Instructions: </p>
              <p className="mt-1">{eventData.event.paymentInstructions || "Please contact the organizer for payment instructions."}</p>
            </div>
          </>
        )}

        {!isFreeSelection ? (
          <div className="mt-3 rounded border bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Upload Payment Evidence (required, image, max 2MB)</p>
            <input className="mt-2 w-full rounded border p-2" type="file" accept="image/png,image/jpeg,image/webp" onChange={onEvidenceFileChange} />
            {evidenceImageDataUrl ? (
              <div className="mt-2">
                <img src={evidenceImageDataUrl} alt="Payment evidence preview" className="h-24 w-24 rounded border object-cover" />
              </div>
            ) : null}
          </div>
        ) : null}

        <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

        <AppButton className="mt-3" onClick={submitRequest} loading={submitting} loadingText="Submitting...">
          Request Tickets
        </AppButton>
      </section>
    </main>
  );
}
