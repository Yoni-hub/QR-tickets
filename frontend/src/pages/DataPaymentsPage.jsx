export default function DataPaymentsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Data &amp; Payments</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: 2026</p>

      <p className="mt-6 text-sm text-slate-700">
        Here's how payments work:
      </p>

      <ul className="mt-4 space-y-3 text-sm text-slate-700">
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>There are no upfront or monthly fees.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>You only pay $0.99 per ticket sold.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>Payments from your customers go directly to you (or your selected method).</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>Our fee is applied only after a successful ticket sale.</li>
      </ul>

      <p className="mt-6 text-sm text-slate-700">
        All transactions are processed securely.
      </p>
    </main>
  );
}
