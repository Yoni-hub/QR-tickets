import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";

export default function Scanner() {
  const [params] = useSearchParams();
  const [accessCode, setAccessCode] = useState(params.get("code") || "");
  const [ticketPublicId, setTicketPublicId] = useState("");
  const [result, setResult] = useState("READY");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const scan = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.post("/scans", { accessCode, ticketPublicId });
      setResult(response.data.result || "INVALID");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Scan failed.");
      setResult("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const stateClass = result === "VALID" ? "bg-green-100 text-green-800" : result === "USED" ? "bg-yellow-100 text-yellow-800" : result === "INVALID" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-800";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Scanner</h1>
      <p className="mt-2 text-slate-600">Camera integration can be added later; manual ticketPublicId scan is active now.</p>
      <div className="mt-4 grid gap-3">
        <input className="rounded border p-2" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="Access code" />
        <input className="rounded border p-2" value={ticketPublicId} onChange={(e) => setTicketPublicId(e.target.value)} placeholder="ticketPublicId" />
      </div>
      <button className="mt-4 rounded bg-black px-4 py-2 text-white" onClick={scan} disabled={loading}>{loading ? "Scanning..." : "Scan"}</button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className={`mt-5 rounded border p-6 text-center text-4xl font-bold ${stateClass}`}>{result}</div>
    </main>
  );
}
