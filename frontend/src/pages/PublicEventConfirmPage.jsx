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
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Request Received</h1>
      <p className="mt-2 text-slate-700">
        {isFreeRequest
          ? "Thanks for the request. The organizer will send your tickets in a few minutes."
          : "Thank you for your payment. The organizer will process your payment and send the tickets to your client dashboard in a few minutes."}
      </p>
      {clientAccessToken ? (
        <div className="mt-2 space-y-1 text-sm font-bold text-black">
          <p>✔ Save your client access token.</p>
          <p>✔ Never share it with people you don&apos;t know.</p>
          <p>✔ You will use it to access your dashboard and see your tickets.</p>
        </div>
      ) : null}

      <div className="mt-4 rounded border bg-white p-4 text-sm">
        <p><span className="font-semibold">Status:</span> {requestStatus}</p>
        <p><span className="font-semibold">Ticket types:</span> {selections.length ? selections.map((item) => `${item.ticketType} x${item.quantity}`).join(", ") : request?.ticketType || "-"}</p>
        <p><span className="font-semibold">Quantity:</span> {payment?.totalQuantity || request?.quantity || "-"}</p>
        <p><span className="font-semibold">Total payment:</span> {isFreeRequest ? "FREE" : `$${totalPrice.toFixed(2)}`}</p>
        <p><span className="font-semibold">Request ID:</span> <span className="font-mono">{request?.id || "-"}</span></p>
        <p>
          <span className="font-semibold">Client Access Token:</span>{" "}
          <span className="font-mono break-all text-green-600">{clientAccessToken || "-"}</span>
          {clientAccessToken ? (
            <button
              type="button"
              onClick={copyClientAccessToken}
              className="ml-2 inline-flex rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <AppButton variant="secondary" onClick={() => navigate(`/e/${eventSlug}`)}>
          Back to Event Page
        </AppButton>
        {clientAccessToken ? (
          <AppButton variant="indigo" onClick={() => navigate(`/client/${encodeURIComponent(clientAccessToken)}`)}>
            Open Client Dashboard
          </AppButton>
        ) : null}
      </div>
    </main>
  );
}

