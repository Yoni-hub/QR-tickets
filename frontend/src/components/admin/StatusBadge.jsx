const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-800",
  disabled: "bg-amber-100 text-amber-900",
  archived: "bg-slate-200 text-slate-700",
  valid: "bg-emerald-100 text-emerald-800",
  used: "bg-amber-100 text-amber-900",
  invalid: "bg-red-100 text-red-700",
  "valid-unused": "bg-emerald-100 text-emerald-800",
  invalidated: "bg-red-100 text-red-700",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  unknown: "bg-slate-200 text-slate-700",
  opened: "bg-blue-100 text-blue-800",
  "not-opened": "bg-slate-200 text-slate-700",
};

export default function StatusBadge({ value }) {
  const normalized = String(value || "unknown").toLowerCase();
  const style = STATUS_STYLES[normalized] || "bg-slate-200 text-slate-700";
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${style}`}>{normalized}</span>;
}