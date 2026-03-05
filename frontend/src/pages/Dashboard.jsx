import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    setParams({ code: code.trim() });
    try {
      const summaryRes = await api.get(`/events/by-code/${encodeURIComponent(code.trim())}`);
      setSummary(summaryRes.data);
      const ticketsRes = await api.get(`/events/${summaryRes.data.event.id}/tickets`);
      setTickets(ticketsRes.data.tickets || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load dashboard.");
      setSummary(null);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!summary?.event?.id) return;
    setError("");
    try {
      const response = await api.get(`/events/${summary.event.id}/tickets.pdf`, { responseType: "blob" });
      const contentType = String(response.headers?.["content-type"] || "");
      if (!contentType.includes("application/pdf") || response.data.size < 500) {
        const text = await response.data.text();
        throw new Error(text || "PDF generation failed.");
      }
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "tickets.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Could not download tickets PDF.");
    }
  };

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="mt-4 flex gap-2">
        <input className="w-64 rounded border p-2" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" />
        <button className="rounded bg-black px-4 py-2 text-white" onClick={load} disabled={loading}>{loading ? "Loading..." : "Load"}</button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {summary ? (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded border p-3"><p className="text-xs">Total</p><p className="text-2xl font-bold">{summary.totalTickets}</p></div>
            <div className="rounded border p-3"><p className="text-xs">Scanned</p><p className="text-2xl font-bold">{summary.scannedTickets}</p></div>
            <div className="rounded border p-3"><p className="text-xs">Remaining</p><p className="text-2xl font-bold">{summary.remainingTickets}</p></div>
          </div>

          <div className="mt-4 rounded border p-4">
            <p><span className="font-semibold">Event:</span> {summary.event.eventName}</p>
            <p><span className="font-semibold">Date:</span> {new Date(summary.event.eventDate).toLocaleString()}</p>
            <p><span className="font-semibold">Location:</span> {summary.event.eventAddress}</p>
            <button className="mt-3 rounded border px-3 py-2" onClick={downloadPdf}>Download Tickets PDF</button>
          </div>

          <div className="mt-5 overflow-x-auto rounded border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2">ticketPublicId</th><th className="p-2">status</th><th className="p-2">scannedAt</th></tr></thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.ticketPublicId} className="border-t">
                    <td className="p-2 font-mono">{ticket.ticketPublicId}</td>
                    <td className="p-2">{ticket.status}</td>
                    <td className="p-2">{ticket.scannedAt ? new Date(ticket.scannedAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </main>
  );
}
