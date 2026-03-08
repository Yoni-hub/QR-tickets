import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";

const SCANNER_ID = "qr-reader";

function extractTicketPublicId(text) {
  const value = (text || "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const tIndex = parts.findIndex((part) => part === "t");
    if (tIndex >= 0 && parts[tIndex + 1]) {
      return parts[tIndex + 1];
    }
  } catch {
    return value;
  }

  return value;
}

export default function Scanner() {
  const [params] = useSearchParams();
  const [accessCode, setAccessCode] = useState(params.get("code") || "");
  const [ticketPublicId, setTicketPublicId] = useState("");
  const [result, setResult] = useState("READY");
  const [scanDetails, setScanDetails] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [checking, setChecking] = useState(false);
  const [cameraActionLoading, setCameraActionLoading] = useState("");
  const [cameraOn, setCameraOn] = useState(false);

  const scannerRef = useRef(null);
  const coolDownUntilRef = useRef(0);

  const submitScan = async (publicId, rawValue = publicId, source = "manual") => {
    if (checking) return;
    setChecking(true);
    setFeedback({ kind: "", message: "" });

    try {
      const response = await withMinDelay(
        api.post("/scans", {
          accessCode,
          ticketPublicId: publicId,
          rawScannedValue: rawValue,
          scannerSource: source,
        }),
      );
      const nextResult = response.data.result || "INVALID";
      setResult(nextResult);
      setScanDetails(response.data.ticket || null);

      if (nextResult === "VALID") {
        setFeedback({ kind: "success", message: "Ticket validated." });
      } else if (nextResult === "USED") {
        setFeedback({ kind: "info", message: "Ticket already used." });
      } else {
        setFeedback({ kind: "error", message: "Failed to validate ticket." });
      }
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Scan failed." });
      setResult("ERROR");
      setScanDetails(null);
    } finally {
      setChecking(false);
    }
  };

  const startCamera = async () => {
    if (cameraOn || cameraActionLoading) return;
    setCameraActionLoading("starting");
    setFeedback({ kind: "", message: "" });

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(SCANNER_ID);
      }

      await withMinDelay(
        scannerRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            const now = Date.now();
            if (now < coolDownUntilRef.current) return;
            coolDownUntilRef.current = now + 1500;

            const parsedId = extractTicketPublicId(decodedText);
            if (!parsedId) {
              setResult("INVALID");
              return;
            }

            setTicketPublicId(parsedId);
            await submitScan(parsedId, decodedText, "camera");
          },
          () => {},
        ),
      );

      setCameraOn(true);
      setFeedback({ kind: "success", message: "Camera started." });
    } catch {
      setFeedback({ kind: "error", message: "Unable to start camera." });
    } finally {
      setCameraActionLoading("");
    }
  };

  const stopCamera = async () => {
    if (!scannerRef.current || !cameraOn || cameraActionLoading) return;
    setCameraActionLoading("stopping");
    setFeedback({ kind: "", message: "" });

    try {
      await withMinDelay(scannerRef.current.stop());
      await scannerRef.current.clear();
      setCameraOn(false);
      setFeedback({ kind: "info", message: "Camera stopped." });
    } catch {
      setFeedback({ kind: "error", message: "Unable to stop camera cleanly." });
    } finally {
      setCameraActionLoading("");
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && cameraOn) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [cameraOn]);

  const scanManual = async () => {
    if (!accessCode.trim()) {
      setFeedback({ kind: "error", message: "Access code is required." });
      return;
    }

    const rawInput = ticketPublicId;
    const parsed = extractTicketPublicId(rawInput);
    if (!parsed) {
      setFeedback({ kind: "error", message: "Enter a valid ticket id or QR text." });
      return;
    }

    setTicketPublicId(parsed);
    await submitScan(parsed, rawInput, "manual");
  };

  const stateClass =
    result === "VALID"
      ? "bg-green-100 text-green-800"
      : result === "USED"
        ? "bg-yellow-100 text-yellow-800"
        : result === "INVALID"
          ? "bg-red-100 text-red-800"
          : "bg-slate-100 text-slate-800";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Scanner</h1>
      <p className="mt-2 text-slate-600">Scan QR with camera or paste ticketPublicId manually.</p>

      <div className="mt-4 grid gap-3">
        <input
          className="rounded border p-2"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          placeholder="Access code"
        />
        <input
          className="rounded border p-2"
          value={ticketPublicId}
          onChange={(e) => setTicketPublicId(e.target.value)}
          placeholder="ticketPublicId or QR text"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 sm:flex-row">
        <AppButton
          onClick={scanManual}
          loading={checking}
          loadingText="Checking..."
          disabled={Boolean(cameraActionLoading)}
        >
          Scan Manual
        </AppButton>
        <AppButton
          variant="secondary"
          onClick={startCamera}
          loading={cameraActionLoading === "starting"}
          loadingText="Starting..."
          disabled={cameraOn || checking || cameraActionLoading === "stopping"}
        >
          Start Camera
        </AppButton>
        <AppButton
          variant="secondary"
          onClick={stopCamera}
          loading={cameraActionLoading === "stopping"}
          loadingText="Stopping..."
          disabled={!cameraOn || checking || cameraActionLoading === "starting"}
        >
          Stop Camera
        </AppButton>
      </div>

      <div id={SCANNER_ID} className="mt-4 overflow-hidden rounded border bg-white [&_canvas]:max-w-full [&_video]:max-w-full" />
      <FeedbackBanner className="mt-2" kind={feedback.kind} message={feedback.message} />
      <div className={`mt-5 break-words rounded border p-4 text-center text-3xl font-bold sm:p-6 sm:text-4xl ${stateClass}`}>{result}</div>
      {scanDetails ? (
        <div className="mt-3 rounded border bg-white p-3 text-sm">
          <p><span className="font-semibold">Name:</span> {scanDetails.attendeeName || "-"}</p>
          <p><span className="font-semibold">Type:</span> {scanDetails.ticketType || "-"}</p>
          <p><span className="font-semibold">Price:</span> {scanDetails.ticketPrice != null ? `$${Number(scanDetails.ticketPrice).toFixed(2)}` : "-"}</p>
          <p><span className="font-semibold">Tickets:</span> {scanDetails.quantity || 1}</p>
          <p><span className="font-semibold">Promoter:</span> {scanDetails.promoterName || "-"}</p>
        </div>
      ) : null}
    </main>
  );
}
