import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";

export default function DashboardPromoterDetailPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const accessCode = useMemo(() => String(params.get("code") || "").trim(), [params]);
  const [promoter, setPromoter] = useState(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [feedback, setFeedback] = useState({ kind: "", message: "" });

  const load = async () => {
    if (!accessCode) return;
    try {
      const response = await api.get(`/events/by-code/${encodeURIComponent(accessCode)}/promoters`);
      const found = (response.data.items || []).find((item) => item.id === id);
      setPromoter(found || null);
      if (found) setForm({ name: found.name, code: found.code });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not load promoter." });
    }
  };

  useEffect(() => {
    load();
  }, [id, accessCode]);

  const save = async () => {
    try {
      const response = await api.patch(`/promoters/${encodeURIComponent(id)}`, {
        accessCode,
        name: form.name,
        code: form.code,
      });
      setPromoter(response.data.promoter);
      setFeedback({ kind: "success", message: "Promoter updated." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Save failed." });
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Promoter Detail</h1>
      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      {promoter ? (
        <section className="mt-4 rounded border bg-white p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className="rounded border p-2" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            <input className="rounded border p-2" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} />
          </div>
          <p className="mt-2 text-xs break-all">Link: {promoter.link}</p>
          <AppButton className="mt-3" onClick={save}>Save</AppButton>
        </section>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Promoter not found.</p>
      )}
    </main>
  );
}