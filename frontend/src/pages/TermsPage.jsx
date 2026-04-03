export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: 2026</p>

      <p className="mt-6 text-sm text-slate-700">
        By using Connsura Tickets, you agree to the following:
      </p>

      <ul className="mt-4 space-y-3 text-sm text-slate-700">
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>You can create events and sell tickets using our platform.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>There are no upfront fees to use the service.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>A fixed fee of $0.99 is charged per ticket sold.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>You are responsible for your event, pricing, and attendees.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>You agree not to misuse the platform (fraud, abuse, illegal activity).</li>
      </ul>

      <p className="mt-6 text-sm text-slate-700">
        We provide the platform "as is" and may update features or terms as needed.
      </p>
    </main>
  );
}
