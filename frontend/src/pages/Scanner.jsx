import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import api from "../lib/api";

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  const scannerRef = useRef(null);
  const coolDownUntilRef = useRef(0);

  const submitScan = async (publicId) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post("/scans", { accessCode, ticketPublicId: publicId });
      setResult(response.data.result || "INVALID");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Scan failed.");
      setResult("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    if (cameraOn) return;

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(SCANNER_ID);
    }

    await scannerRef.current.start(
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
        await submitScan(parsedId);
      },
      () => {}
    );

    setCameraOn(true);
  };

  const stopCamera = async () => {
    if (scannerRef.current && cameraOn) {
      await scannerRef.current.stop();
      await scannerRef.current.clear();
      setCameraOn(false);
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
    const parsed = extractTicketPublicId(ticketPublicId);
    setTicketPublicId(parsed);
    await submitScan(parsed);
  };

  const stateClass = result === "VALID" ? "bg-green-100 text-green-800" : result === "USED" ? "bg-yellow-100 text-yellow-800" : result === "INVALID" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-800";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Scanner</h1>
      <p className="mt-2 text-slate-600">Scan QR with camera or paste ticketPublicId manually.</p>

      <div className="mt-4 grid gap-3">
        <input className="rounded border p-2" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="Access code" />
        <input className="rounded border p-2" value={ticketPublicId} onChange={(e) => setTicketPublicId(e.target.value)} placeholder="ticketPublicId or QR text" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={scanManual} disabled={loading}>{loading ? "Scanning..." : "Scan Manual"}</button>
        <button className="rounded border px-4 py-2" onClick={startCamera} disabled={cameraOn}>Start Camera</button>
        <button className="rounded border px-4 py-2" onClick={stopCamera} disabled={!cameraOn}>Stop Camera</button>
      </div>

      <div id={SCANNER_ID} className="mt-4 overflow-hidden rounded border bg-white" />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className={`mt-5 rounded border p-6 text-center text-4xl font-bold ${stateClass}`}>{result}</div>
    </main>
  );
}
