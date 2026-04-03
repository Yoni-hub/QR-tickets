export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: 2026</p>

      <p className="mt-6 text-sm text-slate-700">
        We respect your privacy and keep things simple:
      </p>

      <ul className="mt-4 space-y-3 text-sm text-slate-700">
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>We only collect the information needed to operate your account and events (name, email, ticket data).</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>We do not sell your data.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>Payment information is handled securely through trusted providers.</li>
        <li className="flex gap-2"><span className="mt-0.5 text-indigo-600">•</span>We use basic analytics to improve the platform experience.</li>
      </ul>

      <p className="mt-6 text-sm text-slate-700">
        By using Connsura Tickets, you agree to this data usage.
      </p>
    </main>
  );
}
