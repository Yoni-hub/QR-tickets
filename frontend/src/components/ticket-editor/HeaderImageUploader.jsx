import AppButton from "../ui/AppButton";

export default function HeaderImageUploader({ hasImage, onUpload, onRemove, imageLoading = false }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        className={`cursor-pointer rounded border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
          imageLoading ? "cursor-not-allowed bg-slate-100 text-slate-500 opacity-70" : "bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {imageLoading ? "Uploading..." : "Upload header image"}
        <input
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          disabled={imageLoading}
          onChange={onUpload}
        />
      </label>
      {hasImage ? (
        <AppButton type="button" variant="danger" className="px-3 py-2 text-sm" onClick={onRemove} disabled={imageLoading}>
          Remove
        </AppButton>
      ) : null}
    </div>
  );
}
