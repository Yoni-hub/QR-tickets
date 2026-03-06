import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import TicketPreview from "./TicketPreview";
import TicketSettingsForm from "./TicketSettingsForm";

const HEADER_IMAGE_WIDTH = 1200;
const HEADER_IMAGE_HEIGHT = 600;
const HEADER_IMAGE_QUALITY = 0.82;

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

export default function TicketEditor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [previewQrPayload, setPreviewQrPayload] = useState("");
  const [ticketDesign, setTicketDesign] = useState({
    eventName: "QR Tickets Demo Event",
    location: "Sample Venue",
    dateTimeText: "May 15, 2024 | 7:00 PM",
    ticketTypeLabel: "GENERAL ADMISSION",
    priceText: "Free",
    codeText: "CODE123",
    headerImageDataUrl: null,
    headerOverlay: 0.25,
    headerTextColorMode: "AUTO",
  });
  const [settings, setSettings] = useState({
    quantity: 10,
    ticketGroups: [{ ticketType: "General", ticketPrice: "0", quantity: "10" }],
  });

  const totalQuantity = useMemo(
    () =>
      Math.max(
        1,
        settings.ticketGroups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
      ),
    [settings.ticketGroups],
  );

  const syncDesignFromPrimaryGroup = (groups) => {
    const firstGroup = groups[0];
    if (!firstGroup) return;
    setTicketDesign((prev) => ({
      ...prev,
      ticketTypeLabel: firstGroup.ticketType ? firstGroup.ticketType.toUpperCase() : prev.ticketTypeLabel,
      priceText:
        firstGroup.ticketPrice && Number(firstGroup.ticketPrice) > 0
          ? `$${Number(firstGroup.ticketPrice).toFixed(2)}`
          : "Free",
    }));
  };

  const updateSettings = (updater) => {
    setSettings((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const groups = next.ticketGroups || prev.ticketGroups;
      syncDesignFromPrimaryGroup(groups);
      const nextQuantity = Math.max(
        1,
        groups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
      );
      return { ...next, quantity: nextQuantity };
    });
  };

  const onHeaderImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const optimizedImage = await optimizeHeaderImage(file);
      setTicketDesign((prev) => ({ ...prev, headerImageDataUrl: optimizedImage }));
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setTicketDesign((prev) => ({ ...prev, headerImageDataUrl: String(reader.result || "") }));
      };
      reader.readAsDataURL(file);
    }
    event.target.value = "";
  };

  const tryDemo = async () => {
    setLoading(true);
    setError("");
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
        designJson: ticketDesign,
      };
      const response = await api.post("/demo/events", payload);
      const created = response.data;
      setResult(created);
      try {
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
      } catch {
        setPreviewQrPayload(`${window.location.origin}/t/${encodeURIComponent(created.accessCode)}`);
      }

    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not create demo event.");
    } finally {
      setLoading(false);
    }
  };

  const formatGroupPrice = (group) =>
    group.ticketPrice && Number(group.ticketPrice) > 0 ? `$${Number(group.ticketPrice).toFixed(2)}` : "Free";

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <h1 className="text-3xl font-bold">QR Tickets</h1>
      <p className="mt-2 text-slate-600">
        Edit your ticket sample directly. Then generate demo tickets and deliver via PDF or email links.
      </p>

      <TicketSettingsForm
        settings={{ ...settings, quantity: totalQuantity }}
        onSettingsChange={updateSettings}
      />

      <section className="mt-6 space-y-6">
        {settings.ticketGroups.map((group, index) => (
          <TicketPreview
            key={`${group.ticketType}-${index}`}
            ticketDesign={ticketDesign}
            previewQrPayload={previewQrPayload}
            onTicketDesignChange={setTicketDesign}
            onHeaderImageUpload={onHeaderImageUpload}
            onRemoveHeaderImage={() => setTicketDesign((prev) => ({ ...prev, headerImageDataUrl: null }))}
            ticketTypeLabelOverride={group.ticketType ? group.ticketType.toUpperCase() : ticketDesign.ticketTypeLabel}
            priceTextOverride={formatGroupPrice(group)}
            title={`Live ticket preview: ${group.ticketType}`}
            helperText="(you can change the event name, location and time directly on the ticket preview)"
          />
        ))}
      </section>

      <div className="mt-6">
        <button type="button" className="rounded bg-black px-4 py-2 text-white" onClick={tryDemo} disabled={loading}>
          {loading ? "Generating..." : "Generate Tickets"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {result?.accessCode ? (
        <section className="mt-6 rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Event access code</p>
          <p className="text-3xl font-bold tracking-wider">{result.accessCode}</p>
          <p className="mt-2 text-sm text-blue-700">
            Tickets generated. Go to Dashboard to start managing tickets and choose delivery methods.
          </p>
          <p className="mt-2 text-sm text-amber-700">
            Save this code now. It is very important. Do not share it with anyone. You will use it to access the event dashboard and open the scanner.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded bg-blue-600 px-3 py-2 text-white"
              onClick={() => navigate(`/dashboard?code=${result.accessCode}`)}
            >
              Go to Dashboard
            </button>
            <button
              className="rounded bg-green-600 px-3 py-2 text-white"
              onClick={() => navigate(`/scanner?code=${result.accessCode}`)}
            >
              Open Scanner
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
