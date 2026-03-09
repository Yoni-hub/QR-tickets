import { useLocation, useNavigate, useParams } from "react-router-dom";
import AppButton from "../components/ui/AppButton";

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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Request Received</h1>
      <p className="mt-2 text-slate-700">
        {isFreeRequest
          ? "Thanks for the request. The organizer will send your tickets in a few minutes."
          : "Thank you for your payment. The organizer will process your payment and send the tickets to your client dashboard in a few minutes."}
      </p>
      {clientAccessToken ? (
        <p className="mt-2 text-sm text-red-600">
          Save your client access token. Never share it with people you don&apos;t know. You will use it to access your dashboard and see your tickets.
        </p>
      ) : null}

      <div className="mt-4 rounded border bg-white p-4 text-sm">
        <p><span className="font-semibold">Status:</span> {request?.status || "PENDING_PAYMENT"}</p>
        <p><span className="font-semibold">Ticket types:</span> {selections.length ? selections.map((item) => `${item.ticketType} x${item.quantity}`).join(", ") : request?.ticketType || "-"}</p>
        <p><span className="font-semibold">Quantity:</span> {payment?.totalQuantity || request?.quantity || "-"}</p>
        <p><span className="font-semibold">Total payment:</span> {isFreeRequest ? "FREE" : `$${totalPrice.toFixed(2)}`}</p>
        <p><span className="font-semibold">Request ID:</span> <span className="font-mono">{request?.id || "-"}</span></p>
        <p><span className="font-semibold">Client Access Token:</span> <span className="font-mono break-all text-green-600">{clientAccessToken || "-"}</span></p>
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
