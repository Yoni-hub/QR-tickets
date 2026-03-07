const STYLES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

export default function FeedbackBanner({ message, kind = "info", className = "" }) {
  if (!message) return null;
  return (
    <p className={`rounded border px-3 py-2 text-sm ${STYLES[kind] || STYLES.info} ${className}`}>
      {message}
    </p>
  );
}
