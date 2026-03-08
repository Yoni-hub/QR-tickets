import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import TicketPreview from "./TicketPreview";
import AppButton from "../ui/AppButton";
import FeedbackBanner from "../ui/FeedbackBanner";
import { withMinDelay } from "../../lib/withMinDelay";

const HEADER_IMAGE_WIDTH = 1200;
const HEADER_IMAGE_HEIGHT = 600;
const HEADER_IMAGE_QUALITY = 0.82;
const DEFAULT_OVERLAY = 0.25;
const DEFAULT_TEXT_COLOR_MODE = "AUTO";

function optimizeHeaderImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => {
      const sourceImage = new Image();
      sourceImage.onerror = () => reject(new Error("Could not load selected image."));
      sourceImage.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = HEADER_IMAGE_WIDTH;
        canvas.height = HEADER_IMAGE_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Image processing context unavailable."));
          return;
        }

        const srcW = sourceImage.width;
        const srcH = sourceImage.height;
        const srcRatio = srcW / srcH;
        const targetRatio = HEADER_IMAGE_WIDTH / HEADER_IMAGE_HEIGHT;
        let sx = 0;
        let sy = 0;
        let sWidth = srcW;
        let sHeight = srcH;

        if (srcRatio > targetRatio) {
          sWidth = Math.round(srcH * targetRatio);
          sx = Math.max(0, Math.round((srcW - sWidth) / 2));
        } else if (srcRatio < targetRatio) {
          sHeight = Math.round(srcW / targetRatio);
          sy = Math.max(0, Math.round((srcH - sHeight) / 2));
        }

        context.drawImage(sourceImage, sx, sy, sWidth, sHeight, 0, 0, HEADER_IMAGE_WIDTH, HEADER_IMAGE_HEIGHT);
        const optimized = canvas.toDataURL("image/webp", HEADER_IMAGE_QUALITY);
        resolve(optimized || String(reader.result || ""));
      };
      sourceImage.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export default function TicketEditor({
  mode = "create_event",
  accessCode = "",
  eventId = "",
  initialEventName = "",
  initialEventAddress = "",
  initialDateTimeText = "",
  initialTicketType = "",
  initialTicketPrice = "",
  onGenerated = null,
  onDraftChange = null,
  onSave = null,
  saveLoading = false,
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [result, setResult] = useState(null);
  const [previewQrPayload, setPreviewQrPayload] = useState("");
  const [ticketDesign, setTicketDesign] = useState({
    eventName: initialEventName || "QR Tickets Demo Event",
    location: initialEventAddress || "Sample Venue",
    dateTimeText: initialDateTimeText || "May 15, 2024 | 7:00 PM",
    codeText: "CODE123",
  });
  const [settings, setSettings] = useState({
    quantity: 10,
    ticketGroups: [
      {
        ticketType: initialTicketType || "General",
        ticketPrice: String(initialTicketPrice || "0"),
        quantity: "10",
        headerImageDataUrl: null,
        headerOverlay: DEFAULT_OVERLAY,
        headerTextColorMode: DEFAULT_TEXT_COLOR_MODE,
      },
    ],
  });

  useEffect(() => {
    setTicketDesign((prev) => ({
      ...prev,
      ...(initialEventName ? { eventName: initialEventName } : {}),
      ...(initialEventAddress ? { location: initialEventAddress } : {}),
      ...(initialDateTimeText ? { dateTimeText: initialDateTimeText } : {}),
    }));
  }, [initialEventName, initialEventAddress, initialDateTimeText]);

  const totalQuantity = useMemo(
    () =>
      Math.max(
        1,
        settings.ticketGroups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
      ),
    [settings.ticketGroups],
  );

  const updateSettings = (updater) => {
    setSettings((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const groups = next.ticketGroups || prev.ticketGroups;
      const nextQuantity = Math.max(
        1,
        groups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
      );
      return { ...next, quantity: nextQuantity };
    });
  };

  const onHeaderImageUpload = async (groupIndex, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageLoading(true);
    setFeedback({ kind: "", message: "" });
    try {
      const optimizedImage = await withMinDelay(optimizeHeaderImage(file), 300);
      updateSettings((prev) => ({
        ...prev,
        ticketGroups: prev.ticketGroups.map((group, index) =>
          index === groupIndex ? { ...group, headerImageDataUrl: optimizedImage } : group,
        ),
      }));
      setFeedback({ kind: "success", message: "Header image uploaded." });
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        updateSettings((prev) => ({
          ...prev,
          ticketGroups: prev.ticketGroups.map((group, index) =>
            index === groupIndex ? { ...group, headerImageDataUrl: String(reader.result || "") } : group,
          ),
        }));
        setFeedback({ kind: "success", message: "Header image uploaded." });
      };
      reader.readAsDataURL(file);
    } finally {
      setImageLoading(false);
    }
    event.target.value = "";
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
          quantity: "1",
          headerImageDataUrl: null,
          headerOverlay: DEFAULT_OVERLAY,
          headerTextColorMode: DEFAULT_TEXT_COLOR_MODE,
        },
      ],
    }));
  };

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    setResult(null);

    try {
      const singleGroup = settings.ticketGroups.length === 1 ? settings.ticketGroups[0] : null;
      const payload = {
        eventName: ticketDesign.eventName,
        eventAddress: ticketDesign.location,
        eventDateTime: ticketDesign.dateTimeText,
        dateTimeText: ticketDesign.dateTimeText,
        ticketType: singleGroup ? singleGroup.ticketType : "Mixed",
        ticketPrice: singleGroup ? singleGroup.ticketPrice : "",
        quantity: String(totalQuantity),
        designJson: buildDraft(ticketDesign, settings).designJson,
      };

      if (mode === "append_to_event") {
        if (!accessCode) throw new Error("Access code is required.");
        await withMinDelay(api.post(`/events/by-code/${encodeURIComponent(accessCode)}/generate-tickets`, payload));

        const effectiveEventId = eventId
          ? eventId
          : (await api.get(`/events/by-code/${encodeURIComponent(accessCode)}`)).data?.event?.id;

        if (effectiveEventId) {
          const ticketsRes = await api.get(`/events/${effectiveEventId}/tickets`);
          const list = ticketsRes.data?.tickets || [];
          if (list.length) {
            const randomTicket = list[Math.floor(Math.random() * list.length)];
            setTicketDesign((prev) => ({ ...prev, codeText: randomTicket.ticketPublicId || prev.codeText }));
            setPreviewQrPayload(
              randomTicket.qrPayload || `${window.location.origin}/t/${encodeURIComponent(randomTicket.ticketPublicId)}`,
            );
          }
        }

        setFeedback({ kind: "success", message: "Tickets generated for current access code." });
        if (typeof onGenerated === "function") {
          await onGenerated({ quantity: totalQuantity });
        }
      } else {
        const response = await withMinDelay(api.post("/demo/events", payload));
        const created = response.data;
        setResult(created);
        setFeedback({ kind: "success", message: "Ticket generated." });

        const ticketsRes = await api.get(`/events/${created.eventId}/tickets`);
        const list = ticketsRes.data?.tickets || [];
        if (list.length) {
          const randomTicket = list[Math.floor(Math.random() * list.length)];
          setTicketDesign((prev) => ({ ...prev, codeText: randomTicket.ticketPublicId || prev.codeText }));
          setPreviewQrPayload(
            randomTicket.qrPayload || `${window.location.origin}/t/${encodeURIComponent(randomTicket.ticketPublicId)}`,
          );
        } else {
          setPreviewQrPayload(`${window.location.origin}/t/${encodeURIComponent(created.accessCode)}`);
        }
      }
    } catch (requestError) {
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || requestError.message || "Failed to generate ticket.",
      });
    } finally {
      setLoading(false);
    }
  };

  const buildDraft = (design = ticketDesign, nextSettings = settings) => {
    const primaryGroup = nextSettings.ticketGroups?.[0] || { ticketType: "", ticketPrice: "" };
    const parsedDate = new Date(String(design.dateTimeText || "").replace(/\s*\|\s*/g, " "));
    const primaryPrice = String(primaryGroup.ticketPrice || "").trim();
    const parsedPrimaryPrice = Number(primaryPrice);
    const resolvedPriceText =
      primaryPrice && Number.isFinite(parsedPrimaryPrice) && parsedPrimaryPrice > 0
        ? `$${parsedPrimaryPrice.toFixed(2)}`
        : primaryPrice || "Free";
    return {
      eventName: String(design.eventName || "").trim(),
      eventAddress: String(design.location || "").trim(),
      eventDate: Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString(),
      ticketType: String(primaryGroup.ticketType || "").trim(),
      ticketPrice: primaryPrice,
      designJson: {
        ...design,
        ticketTypeLabel: String(primaryGroup.ticketType || "General").toUpperCase(),
        priceText: resolvedPriceText,
        headerImageDataUrl: primaryGroup.headerImageDataUrl || null,
        headerOverlay: Number(primaryGroup.headerOverlay ?? DEFAULT_OVERLAY),
        headerTextColorMode: primaryGroup.headerTextColorMode || DEFAULT_TEXT_COLOR_MODE,
        ticketGroups: nextSettings.ticketGroups.map((group) => ({ ...group })),
      },
    };
  };

  useEffect(() => {
    if (typeof onDraftChange === "function") {
      onDraftChange(buildDraft(ticketDesign, settings));
    }
  }, [ticketDesign, settings, onDraftChange]);

  const rootClass =
    mode === "append_to_event"
      ? "w-full"
      : "mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6";

  return (
    <main className={rootClass}>
      <section className="space-y-6">
        {settings.ticketGroups.map((group, index) => (
          <div key={`${index}-${group.ticketType}`} className="space-y-3">
            <TicketPreview
              ticketDesign={ticketDesign}
              ticketGroup={group}
              previewQrPayload={previewQrPayload}
              onTicketDesignChange={setTicketDesign}
              onTicketGroupChange={(field, value) => updateTicketGroup(index, field, value)}
              onHeaderImageUpload={(event) => onHeaderImageUpload(index, event)}
              onRemoveHeaderImage={() => updateTicketGroup(index, "headerImageDataUrl", null)}
              imageLoading={imageLoading}
              title={`Live ticket preview: ${group.ticketType || `Ticket ${index + 1}`}`}
              helperText="(you can change the event name, location, time, type and price directly on the ticket preview)"
            />
            <div className="mx-auto w-full max-w-xl">
              <label className="mb-1 block text-sm font-medium">Quantity</label>
              <input
                className="w-full rounded border p-2 text-sm"
                type="number"
                min="1"
                value={group.quantity}
                onChange={(event) => updateTicketGroup(index, "quantity", event.target.value)}
              />
            </div>
          </div>
        ))}
      </section>

      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <AppButton type="button" variant="secondary" onClick={addMoreTicketTypes}>
            Add more ticket types
          </AppButton>
          {mode === "append_to_event" && typeof onSave === "function" ? (
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => onSave(buildDraft(ticketDesign, settings))}
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

      {mode !== "append_to_event" && result?.accessCode ? (
        <section className="mt-6 rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Event access code</p>
          <p className="break-all text-3xl font-bold tracking-wider">{result.accessCode}</p>
          <p className="mt-2 text-sm text-blue-700">Tickets generated. Go to Dashboard to start managing tickets and choose delivery methods.</p>
          <p className="mt-2 text-sm text-amber-700">Save this code now. It is very important. Do not share it with anyone. You will use it to access the event dashboard and open the scanner.</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <AppButton variant="indigo" onClick={() => navigate(`/dashboard?code=${result.accessCode}`)}>
              Go to Dashboard
            </AppButton>
            <AppButton variant="success" onClick={() => navigate(`/scanner?code=${result.accessCode}`)}>
              Open Scanner
            </AppButton>
          </div>
        </section>
      ) : null}
    </main>
  );
}
