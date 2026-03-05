export default function HeaderImageUploader({ hasImage, onUpload, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="cursor-pointer rounded border bg-white px-3 py-2 text-sm font-medium text-slate-700">
        Upload header image
        <input
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          onChange={onUpload}
        />
      </label>
      {hasImage ? (
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm text-red-600"
          onClick={onRemove}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

