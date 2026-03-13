import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PublicEventExperience from "../components/public/PublicEventExperience";

export default function PublicEventPage() {
  const { eventSlug = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const promoterCode = useMemo(() => String(params.get("ref") || "").trim().toLowerCase(), [params]);

  return (
    <PublicEventExperience
      eventSlug={eventSlug}
      promoterCode={promoterCode}
      onRequestSuccess={(responseData) => {
        navigate(`/e/${eventSlug}/confirm`, {
          state: {
            request: responseData.request,
            instructions: responseData.instructions,
            payment: responseData.payment,
          },
        });
      }}
    />
  );
}
