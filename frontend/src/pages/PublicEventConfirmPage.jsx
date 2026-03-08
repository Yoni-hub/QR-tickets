import { useLocation, useNavigate, useParams } from "react-router-dom";
import AppButton from "../components/ui/AppButton";

export default function PublicEventConfirmPage() {
  const { eventSlug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const instructions = location.state?.instructions || "Send payment and wait for organizer approval.";
  const request = location.state?.request || null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Request Received</h1>
      <p className="mt-2 text-slate-700">Your request has been received.</p>
      <p className="mt-4 rounded border bg-amber-50 p-3 text-sm text-amber-900">{instructions}</p>

      <div className="mt-4 rounded border bg-white p-4 text-sm">
        <p><span className="font-semibold">Status:</span> {request?.status || "PENDING_PAYMENT"}</p>
        <p><span className="font-semibold">Request ID:</span> <span className="font-mono">{request?.id || "-"}</span></p>
      </div>

      <AppButton className="mt-4" variant="secondary" onClick={() => navigate(`/e/${eventSlug}`)}>
        Back to Event Page
      </AppButton>
    </main>
  );
}