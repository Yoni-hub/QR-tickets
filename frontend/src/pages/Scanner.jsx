import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";

const SCANNER_ID = "qr-reader";
const DUPLICATE_SCAN_THRESHOLD_MS = 1200;

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

function outcomeTone(outcome, audioContextRef) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!audioContextRef.current) {
    audioContextRef.current = new AudioCtx();
  }
  const ctx = audioContextRef.current;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  if (outcome === "DUPLICATE_SCAN") return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  if (outcome === "VALID") {
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(920, now);
    oscillator.frequency.exponentialRampToValueAtTime(1180, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
    return;
  }

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(260, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  oscillator.start(now);
  oscillator.stop(now + 0.23);
}

function toOutcome(payload) {
  const outcome = String(payload?.result || "INVALID_TICKET").toUpperCase();
  if (outcome === "USED") {
    return {
      ...payload,
      result: "ALREADY_USED",
      statusText: "ALREADY USED",
      supportingText: "Ticket already scanned",
    };
  }
  return {
    ...payload,
    result: outcome,
    statusText: String(payload?.statusText || outcome).toUpperCase(),
    supportingText: String(payload?.supportingText || ""),
  };
}

export default function Scanner() {
  const [params] = useSearchParams();
  const [organizerAccessCode, setOrganizerAccessCode] = useState(params.get("code") || "");
  const [ticketPublicId, setTicketPublicId] = useState("");
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [scannerUnlocked, setScannerUnlocked] = useState(false);
  const [scanOutcome, setScanOutcome] = useState({
    result: "READY",
    statusText: "READY",
    supportingText: "Scanner ready",
  });
  const [scanDetails, setScanDetails] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [checking, setChecking] = useState(false);
  const [cameraActionLoading, setCameraActionLoading] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [enforceEventDate, setEnforceEventDate] = useState(false);

  const scannerRef = useRef(null);
  const audioContextRef = useRef(null);
  const lastTicketScanRef = useRef({ id: "", timestamp: 0 });
  const resultLockedRef = useRef(false);

  const selectedEvent = useMemo(
    () => events.find((item) => item.id === selectedEventId) || null,
    [events, selectedEventId],
  );

  const setOutcomeWithAutoReset = (outcomePayload) => {
    const normalized = toOutcome(outcomePayload);
    resultLockedRef.current = normalized.result !== "READY";
    setScanOutcome(normalized);
    setScanDetails(normalized.ticket || null);
    outcomeTone(normalized.result, audioContextRef);
  };

  const dismissScanOutcome = () => {
    if (scanOutcome.result === "READY") return;
    resultLockedRef.current = false;
    setScanOutcome({
      result: "READY",
      statusText: "READY",
      supportingText: scannerUnlocked ? "Scanner ready" : "Unlock scanner first",
    });
    setScanDetails(null);
  };

  const unlockScanner = async () => {
    if (!organizerAccessCode.trim() || unlocking) return;
    setUnlocking(true);
    setFeedback({ kind: "", message: "" });

    try {
      const response = await withMinDelay(
        api.get(`/events/by-code/${encodeURIComponent(organizerAccessCode.trim())}`),
      );

      if (response.data?.event?.scannerLocked) {
        setScannerUnlocked(false);
        setEvents([]);
        setSelectedEventId("");
        setFeedback({ kind: "error", message: "Scanner is locked by the administrator. Contact support." });
        return;
      }

      const loadedEvents = Array.isArray(response.data?.events) ? response.data.events : [];
      setEvents(loadedEvents);
      const defaultEventId = String(response.data?.event?.id || loadedEvents[0]?.id || "");
      setSelectedEventId(defaultEventId);
      setScannerUnlocked(Boolean(defaultEventId));
      setFeedback({ kind: "success", message: "Scanner unlocked." });
      resultLockedRef.current = false;
      setScanOutcome({
        result: "READY",
        statusText: "READY",
        supportingText: "Scanner ready",
      });
    } catch (requestError) {
      setScannerUnlocked(false);
      setEvents([]);
      setSelectedEventId("");
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || "Could not unlock scanner.",
      });
    } finally {
      setUnlocking(false);
    }
  };

  const submitScan = async (publicId, rawValue = publicId, source = "manual") => {
    if (checking || resultLockedRef.current || !scannerUnlocked || !selectedEventId) return;
    const now = Date.now();
    const previous = lastTicketScanRef.current;

    if (previous.id === publicId && now - previous.timestamp <= DUPLICATE_SCAN_THRESHOLD_MS) {
      setOutcomeWithAutoReset({
        result: "DUPLICATE_SCAN",
        statusText: "DUPLICATE SCAN",
        supportingText: "Same code scanned again too quickly",
      });
      return;
    }

    lastTicketScanRef.current = { id: publicId, timestamp: now };
    setChecking(true);
    setFeedback({ kind: "", message: "" });

    try {
      const response = await withMinDelay(
        api.post("/scans", {
          organizerAccessCode,
          eventId: selectedEventId,
          accessCode: organizerAccessCode,
          ticketPublicId: publicId,
          rawScannedValue: rawValue,
          scannerSource: source,
          enforceEventDate,
        }),
      );
      const payload = toOutcome(response.data || {});
      setOutcomeWithAutoReset(payload);
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Scan failed." });
      setOutcomeWithAutoReset({
        result: "INVALID_TICKET",
        statusText: "INVALID TICKET",
        supportingText: "Ticket not found or not valid for this organizer",
      });
    } finally {
      setChecking(false);
    }
  };

  const startCamera = async () => {
    if (cameraOn || cameraActionLoading || !scannerUnlocked || !selectedEventId) return;
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
            if (checking || resultLockedRef.current) return;
            const parsedId = extractTicketPublicId(decodedText);
            if (!parsedId) {
              setOutcomeWithAutoReset({
                result: "INVALID_TICKET",
                statusText: "INVALID TICKET",
                supportingText: "Ticket not found or not valid for this organizer",
              });
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
      const scanner = scannerRef.current;
      if (!scanner) return;
      scannerRef.current = null;
      void (async () => {
        try {
          await scanner.stop();
        } catch {}
        try {
          await scanner.clear();
        } catch {}
      })();
    };
  }, []);

  const scanManual = async () => {
    if (!scannerUnlocked || !selectedEventId) {
      setFeedback({ kind: "error", message: "Unlock scanner and select an event first." });
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
    scanOutcome.result === "VALID"
      ? "border-green-700 bg-green-100 text-green-900"
      : scanOutcome.result === "DUPLICATE_SCAN"
        ? "border-amber-500 bg-amber-100 text-amber-900"
        : scanOutcome.result === "READY"
          ? "border-slate-300 bg-slate-100 text-slate-800"
          : "border-red-700 bg-red-100 text-red-900";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Scanner</h1>
      <p className="mt-2 text-slate-600">Unlock with organizer access code, choose event, then scan tickets.</p>

      <div className="mt-4 grid gap-3">
        <input
          className="rounded border p-2"
          value={organizerAccessCode}
          onChange={(e) => setOrganizerAccessCode(e.target.value)}
          placeholder="Organizer access code"
        />
        <AppButton onClick={unlockScanner} loading={unlocking} loadingText="Unlocking...">
          Unlock Scanner
        </AppButton>

        {scannerUnlocked ? (
          <>
            <select
              className="rounded border p-2"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {events.map((eventItem) => (
                <option key={eventItem.id} value={eventItem.id}>
                  {eventItem.eventName}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={enforceEventDate}
                onChange={(e) => setEnforceEventDate(e.target.checked)}
              />
              Enforce event date/session check
            </label>
            <input
              className="rounded border p-2"
              value={ticketPublicId}
              onChange={(e) => setTicketPublicId(e.target.value)}
              placeholder="ticketPublicId or QR text"
            />
          </>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 sm:flex-row">
        <AppButton
          onClick={scanManual}
          loading={checking}
          loadingText="Checking..."
          disabled={!scannerUnlocked || !selectedEventId || Boolean(cameraActionLoading)}
        >
          Scan Manual
        </AppButton>
        <AppButton
          variant="secondary"
          onClick={startCamera}
          loading={cameraActionLoading === "starting"}
          loadingText="Starting..."
          disabled={!scannerUnlocked || !selectedEventId || cameraOn || checking || cameraActionLoading === "stopping"}
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

      <div className="relative mt-4">
        <div id={SCANNER_ID} className="overflow-hidden rounded border bg-white [&_canvas]:max-w-full [&_video]:max-w-full" />
        {scanOutcome.result !== "READY" ? (
          <button
            type="button"
            onClick={dismissScanOutcome}
            className={`absolute inset-0 z-20 flex flex-col items-center justify-center rounded border-2 p-5 text-center ${stateClass}`}
          >
            <p className="text-4xl font-black tracking-wide sm:text-5xl">{scanOutcome.statusText}</p>
            <p className="mt-2 text-lg font-semibold sm:text-xl">{scanOutcome.supportingText}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide">Tap to close and continue scanning</p>
          </button>
        ) : null}
      </div>
      <FeedbackBanner className="mt-2" kind={feedback.kind} message={feedback.message} />

      <section className={`mt-5 rounded border-2 p-5 text-center ${stateClass}`}>
        <p className="text-4xl font-black tracking-wide sm:text-5xl">{scanOutcome.statusText}</p>
        <p className="mt-2 text-lg font-semibold sm:text-xl">{scanOutcome.supportingText}</p>
      </section>

      {scanDetails ? (
        <div className="mt-3 rounded border bg-white p-3 text-sm">
          <p><span className="font-semibold">Holder:</span> {scanDetails.attendeeName || "-"}</p>
          <p><span className="font-semibold">Event:</span> {scanDetails.eventName || selectedEvent?.eventName || "-"}</p>
          <p><span className="font-semibold">Event Date:</span> {scanDetails.eventDate ? new Date(scanDetails.eventDate).toLocaleString() : "-"}</p>
          <p><span className="font-semibold">Type:</span> {scanDetails.ticketType || "-"}</p>
          <p><span className="font-semibold">Scan Time:</span> {scanOutcome.scannedAt ? new Date(scanOutcome.scannedAt).toLocaleString() : "-"}</p>
          <p><span className="font-semibold">Promoter:</span> {scanDetails.promoterName || "-"}</p>
        </div>
      ) : null}
    </main>
  );
}
