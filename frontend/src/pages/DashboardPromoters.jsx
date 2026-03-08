import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";

export default function DashboardPromotersPage() {
  const [params] = useSearchParams();
  const accessCode = useMemo(() => String(params.get("code") || "").trim(), [params]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [items, setItems] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [form, setForm] = useState({ name: "", code: "" });

  const load = async () => {
    if (!accessCode) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await api.get(`/events/by-code/${encodeURIComponent(accessCode)}/promoters`);
      setItems(response.data.items || []);
      setLeaderboard(response.data.leaderboard || []);
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not load promoters." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [accessCode]);

  const createPromoter = async () => {
    if (!form.name.trim()) {
      setFeedback({ kind: "error", message: "Promoter name is required." });
      return;
    }

    try {
      await api.post("/promoters", {
        accessCode,
        name: form.name,
        code: form.code,
      });
      setForm({ name: "", code: "" });
      setFeedback({ kind: "success", message: "Promoter added." });
      await load();
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not add promoter." });
    }
  };

  const removePromoter = async (id) => {
    try {
      await api.delete(`/promoters/${encodeURIComponent(id)}`, { data: { accessCode } });
      setFeedback({ kind: "info", message: "Promoter deleted." });
      await load();
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Delete failed." });
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Promoters</h1>
      <p className="mt-2 text-slate-600">Access code: <span className="font-mono">{accessCode || "(missing code)"}</span></p>
      <p className="mt-1 text-sm"><Link className="text-blue-700" to={`/dashboard/ticket-requests?code=${encodeURIComponent(accessCode)}`}>Go to Ticket Requests</Link></p>

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      <section className="mt-4 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Add Promoter</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className="rounded border p-2" placeholder="Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          <input className="rounded border p-2" placeholder="Code (optional)" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} />
        </div>
        <AppButton className="mt-3" onClick={createPromoter} loading={loading} loadingText="Saving...">Add Promoter</AppButton>
      </section>

      <section className="mt-4 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Promoter List</h2>
        <div className="mt-3 space-y-2">
          {items.map((promoter) => (
            <article key={promoter.id} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{promoter.name}</p>
                <p className="font-mono text-xs">{promoter.code}</p>
              </div>
              <p className="mt-1 text-xs break-all">{promoter.link}</p>
              <p className="mt-1 text-xs">Requests: {promoter.requestCount} | Approved Tickets: {promoter.approvedTickets} | Scanned: {promoter.scannedEntries}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="rounded border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(promoter.link)}>Copy Link</button>
                <Link className="rounded border px-2 py-1 text-xs" to={`/dashboard/promoters/${promoter.id}?code=${encodeURIComponent(accessCode)}`}>Edit</Link>
                <button className="rounded border px-2 py-1 text-xs" onClick={() => removePromoter(promoter.id)}>Delete</button>
              </div>
            </article>
          ))}
          {!items.length ? <p className="text-sm text-slate-500">No promoters yet.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <div className="mt-3 space-y-2">
          {leaderboard.map((row, index) => (
            <div key={row.promoterId} className="flex items-center justify-between rounded border p-2 text-sm">
              <p>{index + 1}. {row.name}</p>
              <p className="font-semibold">{row.ticketsSold}</p>
            </div>
          ))}
          {!leaderboard.length ? <p className="text-sm text-slate-500">No sales tracked yet.</p> : null}
        </div>
      </section>
    </main>
  );
}