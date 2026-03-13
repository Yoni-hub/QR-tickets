import { useEffect, useState } from "react";
import EditableText from "./EditableText";
import HeaderImageUploader from "./HeaderImageUploader";
import AppButton from "../ui/AppButton";

const TEXT_COLOR_MODES = {
  AUTO: "AUTO",
  LIGHT: "LIGHT",
  DARK: "DARK",
};

function channelToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminanceFromRgb(r, g, b) {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

export default function TicketPreview({
  ticketDesign,
  ticketGroup,
  previewQrPayload,
  onTicketDesignChange,
  onTicketGroupChange,
  onHeaderImageUpload,
  onRemoveHeaderImage,
  imageLoading,
  title,
  helperText,
  showRemoveTicketType = false,
  onRemoveTicketType = null,
}) {
  const [autoTextColor, setAutoTextColor] = useState("#ffffff");

  const updateDesignField = (field, nextValue) => {
    onTicketDesignChange((prev) => ({ ...prev, [field]: nextValue }));
  };
  const updateGroupField = (field, nextValue) => {
    onTicketGroupChange(field, nextValue);
  };
  const resolvedTicketTypeLabel = String(ticketGroup?.ticketType || "").trim() || "General";
  const resolvedPriceText = String(ticketGroup?.ticketPrice || "").trim() || "0";

  const headerStyle = ticketGroup?.headerImageDataUrl
    ? {
        backgroundImage: `url(${ticketGroup.headerImageDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
      };

  const qrImageUrl = previewQrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(previewQrPayload)}`
    : null;
  const textColorMode = ticketGroup?.headerTextColorMode || TEXT_COLOR_MODES.AUTO;
  const resolvedHeaderTextColor =
    textColorMode === TEXT_COLOR_MODES.LIGHT ? "#ffffff" : textColorMode === TEXT_COLOR_MODES.DARK ? "#0f172a" : autoTextColor;
  const headerTextShadow = resolvedHeaderTextColor === "#ffffff" ? "0 1px 2px rgba(2, 6, 23, 0.65)" : "0 1px 2px rgba(255, 255, 255, 0.4)";

  useEffect(() => {
    const src = ticketGroup?.headerImageDataUrl;
    if (!src) {
      setAutoTextColor("#ffffff");
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 48;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        setAutoTextColor("#ffffff");
        return;
      }
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;

      let luminanceSum = 0;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3] / 255;
        if (alpha <= 0) continue;
        luminanceSum += luminanceFromRgb(pixels[i], pixels[i + 1], pixels[i + 2]);
        count += 1;
      }
      if (!count) {
        setAutoTextColor("#ffffff");
        return;
      }

      const imageLuminance = luminanceSum / count;
      const overlay = ticketGroup?.headerImageDataUrl ? Number(ticketGroup?.headerOverlay || 0) : 0;
      const effectiveLuminance = imageLuminance * Math.max(0, 1 - overlay);
      setAutoTextColor(effectiveLuminance > 0.26 ? "#0f172a" : "#ffffff");
    };
    image.onerror = () => setAutoTextColor("#ffffff");
    image.src = src;
  }, [ticketGroup?.headerImageDataUrl, ticketGroup?.headerOverlay]);

  return (
    <section className="mx-auto w-full max-w-xl overflow-hidden">
      {title ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {helperText ? <p className="text-xs text-slate-500">{helperText}</p> : null}
          {showRemoveTicketType && typeof onRemoveTicketType === "function" ? (
            <AppButton
              type="button"
              variant="secondary"
              className="!w-auto px-2 py-1 text-xs"
              onClick={onRemoveTicketType}
            >
              Delete ticket type
            </AppButton>
          ) : null}
        </div>
      ) : null}
      <div className="mb-3">
        <HeaderImageUploader
          hasImage={Boolean(ticketGroup?.headerImageDataUrl)}
          onUpload={onHeaderImageUpload}
          onRemove={onRemoveHeaderImage}
          imageLoading={imageLoading}
        />
        <div className="mt-2 flex flex-row flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-slate-600">Text color</span>
          <AppButton
            type="button"
            variant={textColorMode === TEXT_COLOR_MODES.AUTO ? "primary" : "secondary"}
            className="!w-auto shrink-0 px-2 py-1 text-xs"
            onClick={() => updateGroupField("headerTextColorMode", TEXT_COLOR_MODES.AUTO)}
          >
            Auto
          </AppButton>
          <AppButton
            type="button"
            variant={textColorMode === TEXT_COLOR_MODES.LIGHT ? "primary" : "secondary"}
            className="!w-auto shrink-0 px-2 py-1 text-xs"
            onClick={() => updateGroupField("headerTextColorMode", TEXT_COLOR_MODES.LIGHT)}
          >
            Light
          </AppButton>
          <AppButton
            type="button"
            variant={textColorMode === TEXT_COLOR_MODES.DARK ? "primary" : "secondary"}
            className="!w-auto shrink-0 px-2 py-1 text-xs"
            onClick={() => updateGroupField("headerTextColorMode", TEXT_COLOR_MODES.DARK)}
          >
            Dark
          </AppButton>
        </div>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="relative min-h-[160px] p-3 text-white sm:min-h-[180px] sm:p-4" style={headerStyle}>
          <div
            className="absolute inset-0 bg-slate-950"
            style={{ opacity: ticketGroup?.headerImageDataUrl ? ticketGroup?.headerOverlay : 0 }}
          />
          <div className="relative z-10" style={{ color: resolvedHeaderTextColor, textShadow: headerTextShadow }}>
            <EditableText
              value={ticketDesign.organizerName || "Organizer Name"}
              onChange={(next) => updateDesignField("organizerName", next)}
              className="break-words text-xs font-semibold uppercase tracking-[0.16em] opacity-90"
              ariaLabel="Edit organizer name"
            />
            <EditableText
              value={ticketDesign.eventName}
              onChange={(next) => updateDesignField("eventName", next)}
              className="mt-2 break-words text-2xl font-extrabold leading-tight sm:text-3xl"
              ariaLabel="Edit event name"
            />
            <EditableText
              value={ticketDesign.location}
              onChange={(next) => updateDesignField("location", next)}
              className="mt-2 break-words text-sm font-medium"
              ariaLabel="Edit event location"
            />
            <EditableText
              value={ticketDesign.dateTimeText}
              onChange={(next) => updateDesignField("dateTimeText", next)}
              className="mt-1 break-words text-sm"
              ariaLabel="Edit event date and time text"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Type</p>
            <EditableText
              value={resolvedTicketTypeLabel}
              onChange={(next) => updateGroupField("ticketType", next)}
              className="mt-1 text-lg font-bold text-slate-900"
              ariaLabel="Edit ticket type label"
            />

            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Price</p>
            <EditableText
              value={resolvedPriceText}
              onChange={(next) => updateGroupField("ticketPrice", next)}
              className="mt-1 text-xl font-extrabold text-slate-900"
              ariaLabel="Edit ticket price text"
            />
          </div>

          <div className="w-full shrink-0 sm:w-[132px]">
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt="Generated ticket QR"
                className="mx-auto h-28 w-28 rounded-lg border border-slate-200 bg-white p-2 sm:h-32 sm:w-32"
              />
            ) : (
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 sm:h-32 sm:w-32">
                QR Placeholder
              </div>
            )}
            <p className="mt-2 break-all text-center font-mono text-xs text-slate-500 sm:text-left">
              {qrImageUrl ? "Generated ticket QR" : "Generated after you click Generate Tickets"}
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}
