export default function StatCard({ label, value, hint }) {
  return (
    <article className="rounded border bg-white p-3 sm:p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold leading-none">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}