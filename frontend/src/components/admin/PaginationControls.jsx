export default function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize = 5,
  onPrev,
  onNext,
}) {
  if (!totalItems) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
      <p>
        Page {page} of {totalPages} | Showing up to {pageSize} of {totalItems}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-50"
          onClick={onPrev}
          disabled={page <= 1}
        >
          Prev
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:opacity-50"
          onClick={onNext}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
