import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AppButton from "../components/ui/AppButton";

function normalizeRequestStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "PENDING_PAYMENT") return "PENDING_VERIFICATION";
  return normalized || "PENDING_VERIFICATION";
}

export default function PublicEventConfirmPage() {
  const { eventSlug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const request = location.state?.request || null;
  const payment = location.state?.payment || null;
  const currency = String(location.state?.currency || "$");
  const selections = Array.isArray(payment?.selections)
    ? payment.selections
    : Array.isArray(request?.ticketSelections)
      ? request.ticketSelections
      : [];
  const totalPrice = Number(payment?.totalPrice || request?.totalPrice || 0);
  const isFreeRequest = totalPrice <= 0;
  const clientAccessToken = String(request?.clientAccessToken || "").trim();
  const requestStatus = normalizeRequestStatus(request?.status);
  const [copied, setCopied] = useState(false);

  const copyClientAccessToken = async () => {
    if (!clientAccessToken) return;
    try {
      await navigator.clipboard.writeText(clientAccessToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Request Received</h1>
      <p className="mt-1 text-sm text-slate-600">
        {isFreeRequest ? "Your request is pending organizer approval." : "Payment received. Pending organizer approval."}
      </p>

      {clientAccessToken ? (
        <div className="mt-4 rounded border bg-white p-4">
          <p className="text-sm text-slate-500">Your client access token</p>
          <p className="mt-1 break-all font-mono text-lg font-bold text-green-700">{clientAccessToken}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={copyClientAccessToken}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <AppButton variant="indigo" className="px-3 py-1 text-xs" onClick={() => navigate(`/client/${encodeURIComponent(clientAccessToken)}`)}>
              Open Dashboard
            </AppButton>
          </div>
          <p className="mt-2 text-xs text-amber-700">Save this token — you will need it to access your tickets.</p>
        </div>
      ) : null}

      <div className="mt-3 rounded border bg-slate-50 p-3 text-sm text-slate-700">
        <p>{selections.length ? selections.map((item) => `${item.ticketType} x${item.quantity}`).join(", ") : request?.ticketType || "-"}</p>
        <p className="mt-1 font-semibold">{isFreeRequest ? "FREE" : `Total: ${currency}${totalPrice.toFixed(2)}`}</p>
      </div>

      <div className="mt-3">
        <AppButton variant="secondary" onClick={() => navigate(`/e/${eventSlug}`)}>
          Back to Event
        </AppButton>
      </div>
    </main>
  );
}

