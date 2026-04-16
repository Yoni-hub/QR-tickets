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
  const [otpEmail, setOtpEmail] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpRows, setOtpRows] = useState([]);
  const [instructions, setInstructions] = useState({
    ETB: "",
    USD: "",
    EUR: "",
  });
  const [unitPrices, setUnitPrices] = useState({
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
      const unitPriceMap = { ETB: "", USD: "", EUR: "" };
      for (const row of response.data?.paymentInstructions || []) {
        if (row?.currency && Object.prototype.hasOwnProperty.call(instructionMap, row.currency)) {
          instructionMap[row.currency] = String(row.instructionText || "");
          unitPriceMap[row.currency] = row.unitPrice != null ? String(Number(row.unitPrice).toFixed(2)) : "";
        }
      }
      setInstructions(instructionMap);
      setUnitPrices(unitPriceMap);
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

  const handleUnitPriceChange = (currency, value) => {
    setUnitPrices((prev) => ({ ...prev, [currency]: value }));
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
      unitPrices: {
        ETB: unitPrices.ETB,
        USD: unitPrices.USD,
        EUR: unitPrices.EUR,
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

  const lookupOtp = async () => {
    const email = String(otpEmail || "").trim().toLowerCase();
    if (!email) {
      setOtpError("Email is required for OTP lookup.");
      setOtpRows([]);
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      const response = await adminApi.get("/settings/otp-lookup", {
        params: { email, limit: 25 },
      });
      setOtpRows(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (requestError) {
      setOtpError(requestError.response?.data?.error || "Could not load OTP records.");
      setOtpRows([]);
    } finally {
      setOtpLoading(false);
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
          These instructions and unit prices are used by invoice currency and snapshotted into each generated invoice.
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
              <div className="grid gap-1 sm:grid-cols-2 sm:items-center">
                <label htmlFor={`unit-price-${currency}`} className="text-sm font-semibold">
                  {currency} Unit Price (per approved ticket)
                </label>
                <input
                  id={`unit-price-${currency}`}
                  inputMode="decimal"
                  value={unitPrices[currency]}
                  onChange={(event) => handleUnitPriceChange(currency, event.target.value)}
                  className="w-full rounded border px-3 py-2 text-sm"
                  placeholder={currency === "ETB" ? "5.00" : "0.99"}
                />
              </div>
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

      <article className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">OTP Lookup</h2>
        <p className="mt-1 text-xs text-slate-500">
          Search recent OTP verification rows by email for support and recovery debugging.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={otpEmail}
            onChange={(event) => setOtpEmail(event.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Email address"
          />
          <button
            type="button"
            onClick={lookupOtp}
            disabled={otpLoading}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {otpLoading ? "Looking up..." : "Lookup OTP"}
          </button>
        </div>
        {otpError ? <p className="mt-2 text-xs text-rose-700">{otpError}</p> : null}
        {!otpError && otpRows.length === 0 ? <p className="mt-2 text-xs text-slate-500">No OTP records loaded.</p> : null}
        {otpRows.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-2 py-1">Created</th>
                  <th className="px-2 py-1">Slug</th>
                  <th className="px-2 py-1">Code</th>
                  <th className="px-2 py-1">Attempts</th>
                  <th className="px-2 py-1">Verified</th>
                  <th className="px-2 py-1">Token Used</th>
                  <th className="px-2 py-1">Expires</th>
                  <th className="px-2 py-1">Expired</th>
                  <th className="px-2 py-1">Token</th>
                </tr>
              </thead>
              <tbody>
                {otpRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}</td>
                    <td className="px-2 py-1">{row.eventSlug || "-"}</td>
                    <td className="px-2 py-1 font-mono">{row.code || "-"}</td>
                    <td className="px-2 py-1">{row.attempts ?? 0}</td>
                    <td className="px-2 py-1">{row.verified ? "Yes" : "No"}</td>
                    <td className="px-2 py-1">{row.tokenUsed ? "Yes" : "No"}</td>
                    <td className="px-2 py-1">{row.expiresAt ? new Date(row.expiresAt).toLocaleString() : "-"}</td>
                    <td className="px-2 py-1">{row.isExpired ? "Yes" : "No"}</td>
                    <td className="px-2 py-1 font-mono">{row.tokenPreview || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>
    </section>
  );
}
