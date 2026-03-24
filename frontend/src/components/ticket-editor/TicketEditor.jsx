import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import AppButton from "../ui/AppButton";
import FeedbackBanner from "../ui/FeedbackBanner";
import { withMinDelay } from "../../lib/withMinDelay";

export default function TicketEditor({
  mode = "create_event",
  accessCode = "",
  eventId = "",
  initialTicketType = "",
  initialTicketPrice = "",
  onGenerated = null,
  onDraftChange = null,
  onSave = null,
  saveLoading = false,
  canDeleteTicketTypes = true,
}) {
  const navigate = useNavigate();

  const resolveInitialSettings = () => {
    return {
      ticketGroups: [
        {
          ticketType: initialTicketType || "General",
          ticketPrice: String(initialTicketPrice || "0"),
          quantity: "0",
        },
      ],
    };
  };

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [result, setResult] = useState(null);
  const [settings, setSettings] = useState(() => resolveInitialSettings());
  const [currency, setCurrency] = useState("$");

  useEffect(() => {
    setSettings(resolveInitialSettings());
    setResult(null);
    setFeedback({ kind: "", message: "" });
  }, [eventId, initialTicketType, initialTicketPrice]);

  const totalQuantity = useMemo(
    () => Math.max(0, settings.ticketGroups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0)),
    [settings.ticketGroups],
  );

  const updateSettings = (updater) => {
    setSettings((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  };

  const updateTicketGroup = (groupIndex, field, value) => {
    updateSettings((prev) => ({
      ...prev,
      ticketGroups: prev.ticketGroups.map((group, index) =>
        index === groupIndex ? { ...group, [field]: value } : group,
      ),
    }));
  };

  const addMoreTicketTypes = () => {
    updateSettings((prev) => ({
      ...prev,
      ticketGroups: [
        ...prev.ticketGroups,
        {
          ticketType: `Type ${prev.ticketGroups.length + 1}`,
          ticketPrice: "0",
          quantity: "0",
        },
      ],
    }));
  };

  const removeTicketType = (groupIndex) => {
    if (!canDeleteTicketTypes || settings.ticketGroups.length <= 1) return;
    updateSettings((prev) => ({
      ...prev,
      ticketGroups: prev.ticketGroups.filter((_, index) => index !== groupIndex),
    }));
  };

  const buildDraft = (nextSettings = settings) => {
    const primaryGroup = nextSettings.ticketGroups?.[0] || { ticketType: "", ticketPrice: "" };
    return {
      ticketType: String(primaryGroup.ticketType || "").trim(),
      ticketPrice: String(primaryGroup.ticketPrice || "").trim(),
      designJson: null,
    };
  };

  useEffect(() => {
    if (typeof onDraftChange === "function") {
      onDraftChange(buildDraft(settings));
    }
  }, [settings, onDraftChange]);

  const generate = async () => {
    if (loading) return;
    if (totalQuantity < 1) {
      setFeedback({ kind: "error", message: "Set quantity to 1 or more before generating tickets." });
      return;
    }
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    setResult(null);

    try {
      const singleGroup = settings.ticketGroups.length === 1 ? settings.ticketGroups[0] : null;
      const payload = {
        ticketType: singleGroup ? singleGroup.ticketType : "Mixed",
        ticketPrice: singleGroup ? singleGroup.ticketPrice : "",
        quantity: String(totalQuantity),
        currency,
        ticketSelections: settings.ticketGroups.map((g) => ({
          ticketType: g.ticketType,
          ticketPrice: g.ticketPrice,
          quantity: Number.parseInt(g.quantity, 10) || 0,
        })),
      };

      if (mode === "append_to_event") {
        if (!accessCode) throw new Error("Access code is required.");
        if (eventId) payload.eventId = eventId;
        await withMinDelay(api.post(`/events/by-code/${encodeURIComponent(accessCode)}/generate-tickets`, payload));

        setFeedback({ kind: "success", message: "Tickets generated for current access code." });
        setSettings((prev) => ({
          ...prev,
          ticketGroups: prev.ticketGroups.map((group) => ({ ...group, quantity: "0" })),
        }));
        if (typeof onGenerated === "function") {
          await onGenerated({ quantity: totalQuantity });
        }
      } else {
        const response = await withMinDelay(api.post("/demo/events", payload));
        const created = response.data;
        setResult(created);
        setFeedback({ kind: "success", message: "Ticket generated." });
      }
    } catch (requestError) {
      const responseData = requestError.response?.data || {};
      if (responseData.code === "EVENT_TICKETS_LOCKED") {
        const lockMessage = responseData.error || "You cant make changes on delivered tickets. Create a new event from the Events menu.";
        window.alert(lockMessage);
      }
      setFeedback({
        kind: "error",
        message: responseData.error || requestError.message || "Failed to generate ticket.",
      });
    } finally {
      setLoading(false);
    }
  };

  const rootClass =
    mode === "append_to_event"
      ? "w-full"
      : "mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6";

  return (
    <main className={rootClass}>
      <section className="space-y-4">
        {settings.ticketGroups.map((group, index) => (
          <div key={index} className="rounded border bg-white p-4 space-y-3">
            {canDeleteTicketTypes && settings.ticketGroups.length > 1 ? (
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Ticket Type {index + 1}</p>
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-700"
                  onClick={() => removeTicketType(index)}
                >
                  Remove
                </button>
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-sm font-medium">Ticket Type</label>
              <input
                className="w-full rounded border p-2 text-sm"
                type="text"
                value={group.ticketType}
                placeholder="e.g. General, VIP"
                onChange={(e) => updateTicketGroup(index, "ticketType", e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              {index === 0 ? (
                <div className="w-24">
                  <label className="mb-1 block text-sm font-medium">Currency</label>
                  <input
                    className="w-full rounded border p-2 text-sm"
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  />
                </div>
              ) : <div className="w-24" />}
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium">Price</label>
                <input
                  className="w-full rounded border p-2 text-sm"
                  type="number"
                  min="0"
                  step="0.01"
                  value={group.ticketPrice}
                  placeholder="0"
                  onChange={(e) => updateTicketGroup(index, "ticketPrice", e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium">Quantity</label>
                <input
                  className="w-full rounded border p-2 text-sm"
                  type="number"
                  min="0"
                  value={group.quantity}
                  placeholder="0"
                  onChange={(e) => updateTicketGroup(index, "quantity", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <AppButton type="button" variant="secondary" onClick={addMoreTicketTypes}>
            Add more ticket types
          </AppButton>
          {mode === "append_to_event" && typeof onSave === "function" ? (
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => onSave(buildDraft(settings))}
              loading={saveLoading}
              loadingText="Saving..."
            >
              Save Changes
            </AppButton>
          ) : null}
          <AppButton type="button" onClick={generate} loading={loading} loadingText="Generating..." variant="primary">
            Generate Tickets
          </AppButton>
        </div>
      </div>

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      {mode !== "append_to_event" && (result?.organizerAccessCode || result?.accessCode) ? (
        <section className="mt-6 rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Organizer access code</p>
          <p className="break-all text-3xl font-bold tracking-wider">{result.organizerAccessCode || result.accessCode}</p>
          <p className="mt-2 text-sm text-amber-700">Save this code now. It is very important. Do not share it with anyone. You will use it to access the event dashboard and open the scanner.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <AppButton variant="indigo" onClick={() => navigate(`/dashboard?code=${encodeURIComponent(result.organizerAccessCode || result.accessCode)}`)}>
              Go to Dashboard
            </AppButton>
            <AppButton variant="success" onClick={() => navigate(`/scanner?code=${encodeURIComponent(result.organizerAccessCode || result.accessCode)}`)}>
              Open Scanner
            </AppButton>
          </div>
        </section>
      ) : null}
    </main>
  );
}
