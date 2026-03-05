import EditableText from "./EditableText";
import HeaderImageUploader from "./HeaderImageUploader";

export default function TicketPreview({
  ticketDesign,
  previewQrPayload,
  onTicketDesignChange,
  onHeaderImageUpload,
  onRemoveHeaderImage,
}) {
  const updateField = (field, nextValue) => {
    onTicketDesignChange((prev) => ({ ...prev, [field]: nextValue }));
  };

  const headerStyle = ticketDesign.headerImageDataUrl
    ? {
        backgroundImage: `url(${ticketDesign.headerImageDataUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
      };

  const qrImageUrl = previewQrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(previewQrPayload)}`
    : null;

  return (
    <section className="mx-auto w-full max-w-xl">
      <div className="mb-3">
        <HeaderImageUploader
          hasImage={Boolean(ticketDesign.headerImageDataUrl)}
          onUpload={onHeaderImageUpload}
          onRemove={onRemoveHeaderImage}
        />
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="relative min-h-[180px] p-4 text-white" style={headerStyle}>
          <div
            className="absolute inset-0 bg-slate-950"
            style={{ opacity: ticketDesign.headerImageDataUrl ? ticketDesign.headerOverlay : 0 }}
          />
          <div className="relative z-10">
            <EditableText
              value={ticketDesign.eventName}
              onChange={(next) => updateField("eventName", next)}
              className="text-3xl font-extrabold leading-tight"
              ariaLabel="Edit event name"
            />
            <EditableText
              value={ticketDesign.location}
              onChange={(next) => updateField("location", next)}
              className="mt-2 text-sm font-medium"
              ariaLabel="Edit event location"
            />
            <EditableText
              value={ticketDesign.dateTimeText}
              onChange={(next) => updateField("dateTimeText", next)}
              className="mt-1 text-sm"
              ariaLabel="Edit event date and time text"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Type</p>
            <EditableText
              value={ticketDesign.ticketTypeLabel}
              onChange={(next) => updateField("ticketTypeLabel", next)}
              className="mt-1 text-lg font-bold text-slate-900"
              ariaLabel="Edit ticket type label"
            />

            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Price</p>
            <EditableText
              value={ticketDesign.priceText}
              onChange={(next) => updateField("priceText", next)}
              className="mt-1 text-xl font-extrabold text-slate-900"
              ariaLabel="Edit ticket price text"
            />
          </div>

          <div className="w-[148px] shrink-0">
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt="Generated ticket QR"
                className="h-32 w-32 rounded-lg border border-slate-200 bg-white p-2"
              />
            ) : (
              <div className="grid h-32 w-32 place-items-center rounded-lg border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                QR Placeholder
              </div>
            )}
            <p className="mt-2 font-mono text-xs text-slate-500">
              {qrImageUrl ? "Generated ticket QR" : "Generated after Try Demo"}
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}
