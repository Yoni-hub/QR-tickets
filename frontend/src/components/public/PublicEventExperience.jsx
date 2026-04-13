import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import AppButton from "../ui/AppButton";
import FeedbackBanner from "../ui/FeedbackBanner";
import { MAX_EVIDENCE_INPUT_BYTES, optimizeEvidenceDataUrl } from "../../lib/evidenceImage";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function PublicEventExperience({
  eventSlug = "",
  promoterCode = "",
  previewMode = false,
  onRequestSuccess,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventData, setEventData] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", ticketType: "", quantity: 0 });
  const [quantitiesByType, setQuantitiesByType] = useState({});
  const [quantityErrors, setQuantityErrors] = useState({});
  const [evidenceImageDataUrl, setEvidenceImageDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [otpStep, setOtpStep] = useState(false); // true = show OTP entry
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState(""); // received after successful OTP verify

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

  const handleTypeQuantityChange = (ticketType, rawValue, maxRemaining) => {
    const parsed = Math.max(0, Number.parseInt(rawValue, 10) || 0);
    const capped = maxRemaining != null ? Math.min(parsed, maxRemaining) : parsed;
    setQuantitiesByType((prev) => ({ ...prev, [ticketType]: capped }));
    setQuantityErrors((prev) => ({
      ...prev,
      [ticketType]: parsed > maxRemaining ? `Only ${maxRemaining} ticket${maxRemaining !== 1 ? "s" : ""} remaining` : "",
    }));
    setForm((prev) => ({
      ...prev,
      ticketType: capped > 0 ? ticketType : prev.ticketType,
      quantity: capped,
    }));
  };

  const onEvidenceFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setFeedback({ kind: "error", message: "Evidence must be an image file." });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_EVIDENCE_INPUT_BYTES) {
      setFeedback({ kind: "error", message: "Evidence image is too large. Maximum upload size is 8MB." });
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await optimizeEvidenceDataUrl(file);
      setEvidenceImageDataUrl(dataUrl);
      setFeedback({ kind: "success", message: "Evidence image attached and optimized." });
    } catch {
      setFeedback({ kind: "error", message: "Could not process evidence image." });
    }
    event.target.value = "";
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      setFeedback({ kind: "error", message: "Name is required." });
      return false;
    }
    if (!form.email.trim()) {
      setFeedback({ kind: "error", message: "Email is required so we can send you your ticket." });
      return false;
    }
    if (totalQuantity < 1) {
      setFeedback({ kind: "error", message: "Please add quantity for at least one ticket type." });
      return false;
    }
    if (!isFreeSelection && !evidenceImageDataUrl) {
      setFeedback({ kind: "error", message: "Payment evidence is required." });
      return false;
    }
    for (const selection of selectedSelections) {
      if (selection.quantity > selection.remaining) {
        setFeedback({ kind: "error", message: `Only ${selection.remaining} tickets left for ${selection.ticketType}.` });
        return false;
      }
    }
    return true;
  };

  const requestOtp = async () => {
    if (!validateForm()) return;
    if (previewMode) {
      setFeedback({ kind: "success", message: "Preview only. Open the public link to submit a real request." });
      return;
    }
    setSubmitting(true);
    setFeedback({ kind: "", message: "" });
    try {
      const res = await api.post("/public/send-otp", { email: form.email.trim(), eventSlug });
      if (res.data?.alreadyVerified && res.data?.token) {
        // Email already verified recently — skip OTP step and submit directly
        setOtpToken(res.data.token);
        await submitRequest(res.data.token);
        return;
      }
      setOtpStep(true);
      setOtpCode("");
      setFeedback({ kind: "success", message: `Verification code sent to ${form.email.trim()}` });
    } catch (err) {
      setFeedback({ kind: "error", message: err.response?.data?.error || "Could not send verification code." });
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode.trim()) {
      setFeedback({ kind: "error", message: "Please enter the verification code." });
      return;
    }
    setSubmitting(true);
    setFeedback({ kind: "", message: "" });
    try {
      const res = await api.post("/public/verify-otp", { email: form.email.trim(), eventSlug, code: otpCode.trim() });
      setOtpToken(res.data.token);
      setFeedback({ kind: "", message: "" });
      // Auto-submit the request now that email is verified
      await submitRequest(res.data.token);
    } catch (err) {
      setFeedback({ kind: "error", message: err.response?.data?.error || "Verification failed." });
      setSubmitting(false);
    }
  };

  const submitRequest = async (verifiedToken) => {
    setSubmitting(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.post("/public/ticket-request", {
        eventSlug,
        name: form.name,
        email: form.email.trim(),
        otpToken: verifiedToken,
        ticketSelections: selectedSelections.map((item) => ({ ticketType: item.ticketType, quantity: item.quantity })),
        evidenceImageDataUrl: isFreeSelection ? null : evidenceImageDataUrl,
        promoterCode,
      });
      if (typeof onRequestSuccess === "function") {
        onRequestSuccess(response.data, eventData?.event?.currency || "$");
      }
    } catch (requestError) {
      const responseData = requestError.response?.data;
      const responseMessage =
        typeof responseData === "string"
          ? responseData
          : responseData?.error || requestError.message || "Request failed.";
      setFeedback({ kind: "error", message: responseMessage });
      setOtpStep(false); // go back to form on submit failure
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="mx-auto max-w-3xl px-4 py-6">Loading event...</main>;
  if (error) return <main className="mx-auto max-w-3xl px-4 py-6 text-red-600">{error}</main>;
  if (!eventData?.event) return <main className="mx-auto max-w-3xl px-4 py-6">Event not found.</main>;

  if (eventData.published === false && !previewMode) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-4xl mb-4">🔒</p>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Event not yet published</h1>
        <p className="text-gray-500">This event page is not available yet. Check back soon.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      {eventData.published === false && previewMode && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Preview only:</strong> This event is not yet published. Visitors will see a &quot;not yet published&quot; message until the organizer verifies their email.
        </div>
      )}
      <h1 className="text-2xl font-bold sm:text-3xl">{eventData.event.eventName}</h1>
      {eventData.event.organizerName ? (
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
          {eventData.event.organizerName}
        </p>
      ) : null}
      <p className="mt-2 text-slate-600">{formatDate(eventData.event.eventDate)}{eventData.event.eventEndDate ? ` — ${formatDate(eventData.event.eventEndDate)}` : ""} | {eventData.event.location}</p>
      {(() => {
        const now = new Date();
        const startDate = new Date(eventData.event.eventDate);
        const expiryDate = eventData.event.eventEndDate ? new Date(eventData.event.eventEndDate) : startDate;
        const msUntilStart = startDate - now;
        const msUntilEnd = expiryDate - now;

        function formatDuration(ms) {
          const totalMinutes = Math.ceil(ms / 60000);
          const days = Math.floor(totalMinutes / 1440);
          const hours = Math.floor((totalMinutes % 1440) / 60);
          const minutes = totalMinutes % 60;
          const parts = [];
          if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
          if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
          if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
          return parts.join(" ") || "less than a minute";
        }

        function formatTime(hhmm) {
          const [h, m] = hhmm.split(":").map(Number);
          const suffix = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
        }

        function formatCutoffLabel(cutoffDate) {
          const msUntil = cutoffDate - now;
          if (msUntil <= 24 * 3600 * 1000) {
            return `Ticket sales close in ${formatDuration(msUntil)}`;
          }
          return `Ticket sales close on ${cutoffDate.toLocaleString([], { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
        }

        const salesCutoff = eventData.event.salesCutoffAt ? new Date(eventData.event.salesCutoffAt) : null;
        const salesExpired = msUntilEnd <= 0 || (salesCutoff && salesCutoff <= now);
        const hasCutoffNotice = salesCutoff && salesCutoff > now;
        const hasWindowNotice = !salesExpired && eventData.event.salesWindowStart && eventData.event.salesWindowEnd;

        let eventBanner = null;
        if (msUntilEnd <= 0) {
          eventBanner = <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 inline-block">This event has ended</p>;
        } else if (msUntilStart <= 0) {
          eventBanner = <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 inline-block">Event has started — {formatDuration(msUntilEnd)} remaining</p>;
        } else {
          eventBanner = <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 inline-block">Event starts in {formatDuration(msUntilStart)}</p>;
        }

        return (
          <div className="mt-2 flex flex-wrap gap-2">
            {eventBanner}
            {hasCutoffNotice ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 inline-block">{formatCutoffLabel(salesCutoff)}</p>
            ) : null}
            {hasWindowNotice ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 inline-block">Tickets available daily {formatTime(eventData.event.salesWindowStart)} – {formatTime(eventData.event.salesWindowEnd)}</p>
            ) : null}
          </div>
        );
      })()}
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
                <p>{item.price != null ? `${eventData.event.currency || "$"}${Number(item.price).toFixed(2)}` : "Ask organizer"}</p>
                <p>{Number(item.ticketsRemaining || 0) <= 0 ? <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Sold out</span> : item.ticketsRemaining}</p>
                {Number(item.ticketsRemaining || 0) <= 0 ? (
                  <span className="text-xs text-slate-400">—</span>
                ) : (
                  <div>
                    <input
                      className="w-full rounded border p-1.5"
                      type="number"
                      min={0}
                      max={Math.max(0, Number(item.ticketsRemaining || 0))}
                      value={quantitiesByType[item.ticketType] || ""}
                      onChange={(event) => handleTypeQuantityChange(item.ticketType, event.target.value, Number(item.ticketsRemaining || 0))}
                    />
                    {quantityErrors[item.ticketType] ? <p className="mt-1 text-xs text-red-600">{quantityErrors[item.ticketType]}</p> : null}
                  </div>
                )}
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
                  <td className="p-2">{item.price != null ? `${eventData.event.currency || "$"}${Number(item.price).toFixed(2)}` : "Ask organizer"}</td>
                  <td className="p-2">
                    {Number(item.ticketsRemaining || 0) <= 0
                      ? <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Sold out</span>
                      : item.ticketsRemaining}
                  </td>
                  <td className="p-2">
                    {Number(item.ticketsRemaining || 0) <= 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div>
                        <input
                          className="w-24 rounded border p-1.5"
                          type="number"
                          min={0}
                          max={Math.max(0, Number(item.ticketsRemaining || 0))}
                          value={quantitiesByType[item.ticketType] || ""}
                          onChange={(event) => handleTypeQuantityChange(item.ticketType, event.target.value, Number(item.ticketsRemaining || 0))}
                        />
                        {quantityErrors[item.ticketType] ? <p className="mt-1 text-xs text-red-600">{quantityErrors[item.ticketType]}</p> : null}
                      </div>
                    )}
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

      {eventData.event.ticketsRemaining === 0 && (eventData.event.ticketTypes || []).length > 0 ? (
        <div className="mt-5 rounded border border-red-300 bg-red-50 p-4 text-center">
          <p className="text-lg font-bold text-red-700">Sold Out</p>
          <p className="mt-1 text-sm text-red-600">All tickets for this event have been reserved. No more requests can be submitted.</p>
        </div>
      ) : null}

      {(() => {
        const now = new Date();
        const expiryDate = eventData.event.eventEndDate ? new Date(eventData.event.eventEndDate) : new Date(eventData.event.eventDate);
        if (now > expiryDate) {
          return (
            <div className="mt-5 rounded border border-red-300 bg-red-50 p-4 text-center">
              <p className="text-lg font-bold text-red-700">This event has ended</p>
              <p className="mt-1 text-sm text-red-600">Ticket requests are no longer accepted.</p>
            </div>
          );
        }
        if (eventData.event.salesCutoffAt && now > new Date(eventData.event.salesCutoffAt)) {
          return (
            <div className="mt-5 rounded border border-red-300 bg-red-50 p-4 text-center">
              <p className="text-lg font-bold text-red-700">Ticket sales have closed</p>
              <p className="mt-1 text-sm text-red-600">The organizer has stopped accepting new ticket requests.</p>
            </div>
          );
        }
        if (eventData.event.salesWindowStart && eventData.event.salesWindowEnd) {
          const [startH, startM] = eventData.event.salesWindowStart.split(":").map(Number);
          const [endH, endM] = eventData.event.salesWindowEnd.split(":").map(Number);
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          const windowStartMinutes = startH * 60 + startM;
          const windowEndMinutes = endH * 60 + endM;
          if (nowMinutes < windowStartMinutes || nowMinutes >= windowEndMinutes) {
            return (
              <div className="mt-5 rounded border border-amber-300 bg-amber-50 p-4 text-center">
                <p className="text-lg font-bold text-amber-800">Ticket sales are currently closed</p>
                <p className="mt-1 text-sm text-amber-700">Sales are open from {eventData.event.salesWindowStart} to {eventData.event.salesWindowEnd}. Please come back after {eventData.event.salesWindowEnd}.</p>
              </div>
            );
          }
        }
        return null;
      })()}

      {(() => {
        const now = new Date();
        const expiryDate = eventData.event.eventEndDate ? new Date(eventData.event.eventEndDate) : new Date(eventData.event.eventDate);
        const salesClosed = now > expiryDate
          || (eventData.event.salesCutoffAt && now > new Date(eventData.event.salesCutoffAt));
        const outsideWindow = eventData.event.salesWindowStart && eventData.event.salesWindowEnd && (() => {
          const [startH, startM] = eventData.event.salesWindowStart.split(":").map(Number);
          const [endH, endM] = eventData.event.salesWindowEnd.split(":").map(Number);
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          return nowMinutes < startH * 60 + startM || nowMinutes >= endH * 60 + endM;
        })();
        if (salesClosed || outsideWindow) return null;
        return true;
      })() ? (
      <section className={`mt-5 rounded border bg-white p-4 ${eventData.event.ticketsRemaining === 0 && (eventData.event.ticketTypes || []).length > 0 ? "hidden" : ""}`}>
        <h2 className="text-lg font-semibold">Request Tickets</h2>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <input className="rounded border p-2" placeholder="Name (required)" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <input
            className={`rounded border p-2 ${otpStep ? "bg-slate-50 text-slate-500" : ""}`}
            type="email"
            placeholder="Email (required — we'll send your ticket here)"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            disabled={otpStep || submitting}
          />
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
              <p className="font-semibold">Total payment: {eventData.event.currency || "$"}{finalPrice.toFixed(2)}</p>
              <p className="mt-1">Selected tickets: {totalQuantity}</p>
              <p className="mt-1">Organizer Instructions: </p>
              <p className="mt-1">{eventData.event.paymentInstructions || "Please contact the organizer for payment instructions."}</p>
            </div>
          </>
        )}

        {!isFreeSelection ? (
          <div className="mt-3 rounded border bg-slate-50 p-3 text-sm">
            <p className="font-semibold">Upload Payment Evidence</p>
            <input className="mt-2 w-full rounded border p-2" type="file" accept="image/png,image/jpeg,image/webp" onChange={onEvidenceFileChange} />
            {evidenceImageDataUrl ? (
              <div className="mt-2">
                <img src={evidenceImageDataUrl} alt="Payment evidence preview" className="h-24 w-24 rounded border object-cover" />
              </div>
            ) : null}
          </div>
        ) : null}

        <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

        {otpStep ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-slate-600">Enter the 6-digit code sent to <strong>{form.email}</strong></p>
            <input
              className="w-full rounded border p-2 text-center text-xl font-bold tracking-widest"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="flex gap-2">
              <AppButton className="flex-1" onClick={verifyOtp} loading={submitting} loadingText="Verifying...">
                Verify &amp; Submit
              </AppButton>
              <AppButton variant="secondary" onClick={() => { setOtpStep(false); setFeedback({ kind: "", message: "" }); }}>
                Back
              </AppButton>
            </div>
            <button type="button" className="text-xs text-blue-600 underline" onClick={requestOtp}>
              Resend code
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 underline"
              onClick={() => { setOtpStep(false); setOtpCode(""); setOtpToken(""); setFeedback({ kind: "", message: "" }); }}
              disabled={submitting}
            >
              Change email
            </button>
          </div>
        ) : (
          <AppButton className="mt-3" onClick={requestOtp} loading={submitting} loadingText="Sending code...">
            Request Tickets
          </AppButton>
        )}
      </section>
      ) : null}
    </main>
  );
}
