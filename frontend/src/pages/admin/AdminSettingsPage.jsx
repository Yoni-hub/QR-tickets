import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [settings, setSettings] = useState(null);
  const [instructions, setInstructions] = useState({
    ETB: "",
    USD: "",
    EUR: "",
  });

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await adminApi.get("/settings");
      setSettings(response.data);
      const instructionMap = { ETB: "", USD: "", EUR: "" };
      for (const row of response.data?.paymentInstructions || []) {
        if (row?.currency && Object.prototype.hasOwnProperty.call(instructionMap, row.currency)) {
          instructionMap[row.currency] = String(row.instructionText || "");
        }
      }
      setInstructions(instructionMap);
    } catch (requestError) {
      setLoadError(requestError.response?.data?.error || "Could not load admin settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleInstructionChange = (currency, value) => {
    setInstructions((prev) => ({ ...prev, [currency]: value }));
  };

  const saveInstructions = async () => {
    setSaveMessage("");
    setFormError("");
    const payload = {
      instructions: {
        ETB: instructions.ETB,
        USD: instructions.USD,
        EUR: instructions.EUR,
      },
    };
    setSaving(true);
    try {
      await adminApi.patch("/settings/payment-instructions", payload);
      setSaveMessage("Payment instructions saved.");
      await load();
    } catch (requestError) {
      setFormError(requestError.response?.data?.error || "Could not save payment instructions.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading settings..." />;
  if (loadError) return <ErrorState message={loadError} />;

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
      </article>

      <article className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Invoice Payment Instructions</h2>
        <p className="mt-1 text-xs text-slate-500">
          These instructions are used by invoice currency and snapshotted into each generated invoice.
        </p>
        <div className="mt-3 space-y-3">
          {["ETB", "USD", "EUR"].map((currency) => (
            <div key={currency} className="space-y-1">
              <label htmlFor={`instruction-${currency}`} className="text-sm font-semibold">{currency} Instruction</label>
              <textarea
                id={`instruction-${currency}`}
                rows={3}
                value={instructions[currency]}
                onChange={(event) => handleInstructionChange(currency, event.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder={`Enter ${currency} payment instruction`}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveInstructions}
            disabled={saving}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Instructions"}
          </button>
          {saveMessage ? <p className="text-xs text-emerald-700">{saveMessage}</p> : null}
          {formError ? <p className="text-xs text-rose-700">{formError}</p> : null}
        </div>
      </article>
    </section>
  );
}
