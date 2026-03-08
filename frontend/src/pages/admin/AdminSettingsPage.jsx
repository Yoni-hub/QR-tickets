import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await adminApi.get("/settings");
        if (alive) setSettings(response.data);
      } catch (requestError) {
        if (alive) setError(requestError.response?.data?.error || "Could not load admin settings.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <LoadingState label="Loading settings..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <section className="space-y-3">
      <article className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">System Info</h2>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-3 text-xs">{JSON.stringify(settings.systemInfo, null, 2)}</pre>
      </article>

      <article className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Runtime Summary</h2>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-3 text-xs">{JSON.stringify({
          publicTicketBaseUrl: settings.publicTicketBaseUrl,
          qrPayloadMode: settings.qrPayloadMode,
          scanBehavior: settings.scanBehavior,
          emailSender: settings.emailSender,
          adminProtection: settings.adminProtection,
        }, null, 2)}</pre>
        <p className="mt-3 text-xs text-slate-500">TODO phase 2: add controlled edit workflow with secure change audit.</p>
      </article>
    </section>
  );
}