export default function LoadingState({ label = "Loading..." }) {
  return <div className="rounded border bg-white p-4 text-sm text-slate-600">{label}</div>;
}