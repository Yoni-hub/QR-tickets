export default function EmptyState({ label = "No data found." }) {
  return <div className="rounded border bg-white p-4 text-sm text-slate-500">{label}</div>;
}