import AppButton from "../ui/AppButton";

export default function ConfirmActionModal({
  open,
  title = "Confirm action",
  message = "Are you sure?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded border bg-white p-4">
        <h3 className="text-lg font-bold">{title}</h3>
        <div className="mt-2 text-sm text-slate-600">{message}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <AppButton variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</AppButton>
          <AppButton variant="danger" onClick={onConfirm} loading={loading} loadingText="Working...">{confirmLabel}</AppButton>
        </div>
      </div>
    </div>
  );
}
