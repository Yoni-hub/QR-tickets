import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import TicketPreview from "./TicketPreview";
import TicketSettingsForm from "./TicketSettingsForm";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRecipientEmails(rawValue) {
  const parts = String(rawValue || "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const deduped = [];
  const seen = new Set();
  for (const email of parts) {
    if (!EMAIL_PATTERN.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    deduped.push(email);
  }
  return deduped;
}

export default function TicketEditor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendSummary, setSendSummary] = useState(null);
  const [result, setResult] = useState(null);
  const [previewQrPayload, setPreviewQrPayload] = useState("");
  const [ticketDesign, setTicketDesign] = useState({
    eventName: "QR Tickets Demo Event",
    location: "Sample Venue",
    dateTimeText: "May 15, 2024 | 7:00 PM",
    ticketTypeLabel: "GENERAL ADMISSION",
    priceText: "Free",
    codeText: "CODE123",
    headerImageDataUrl: null,
    headerOverlay: 0.25,
  });
  const [settings, setSettings] = useState({
    quantity: 10,
    ticketGroups: [{ ticketType: "General", ticketPrice: "0", quantity: "10" }],
    deliveryMethod: "PDF",
    recipientEmails: "",
  });

  const totalQuantity = useMemo(
    () =>
      Math.max(
        1,
        settings.ticketGroups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
      ),
    [settings.ticketGroups],
  );

  const syncDesignFromPrimaryGroup = (groups) => {
    const firstGroup = groups[0];
    if (!firstGroup) return;
    setTicketDesign((prev) => ({
      ...prev,
      ticketTypeLabel: firstGroup.ticketType ? firstGroup.ticketType.toUpperCase() : prev.ticketTypeLabel,
      priceText:
        firstGroup.ticketPrice && Number(firstGroup.ticketPrice) > 0
          ? `$${Number(firstGroup.ticketPrice).toFixed(2)}`
          : "Free",
    }));
  };

  const updateSettings = (updater) => {
    setSettings((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const groups = next.ticketGroups || prev.ticketGroups;
      syncDesignFromPrimaryGroup(groups);
      const nextQuantity = Math.max(
        1,
        groups.reduce((sum, group) => sum + (Number.parseInt(group.quantity, 10) || 0), 0),
      );
      return { ...next, quantity: nextQuantity };
    });
  };

  const onHeaderImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTicketDesign((prev) => ({ ...prev, headerImageDataUrl: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const sendTicketLinks = async (accessCode) => {
    const emails = parseRecipientEmails(settings.recipientEmails);
    if (!emails.length) {
      setError("Add at least one valid recipient email for Send by email.");
      return;
    }
    setSending(true);
    setError("");
    setSendSummary(null);
    try {
      const response = await api.post(`/orders/${encodeURIComponent(accessCode)}/send-links`, {
        emails,
        baseUrl: window.location.origin,
      });
      setSendSummary(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not send ticket links.");
    } finally {
      setSending(false);
    }
  };

  const tryDemo = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setSendSummary(null);
    try {
      const singleGroup = settings.ticketGroups.length === 1 ? settings.ticketGroups[0] : null;
      const payload = {
        eventName: ticketDesign.eventName,
        eventAddress: ticketDesign.location,
        eventDateTime: ticketDesign.dateTimeText,
        dateTimeText: ticketDesign.dateTimeText,
        ticketType: singleGroup ? singleGroup.ticketType : "Mixed",
        ticketPrice: singleGroup ? singleGroup.ticketPrice : "",
        quantity: String(totalQuantity),
        designJson: ticketDesign,
      };
      const response = await api.post("/demo/events", payload);
      const created = response.data;
      setResult(created);
      try {
        const ticketsRes = await api.get(`/events/${created.eventId}/tickets`);
        const list = ticketsRes.data?.tickets || [];
        if (list.length) {
          const randomTicket = list[Math.floor(Math.random() * list.length)];
          setTicketDesign((prev) => ({ ...prev, codeText: randomTicket.ticketPublicId || prev.codeText }));
          setPreviewQrPayload(
            randomTicket.qrPayload || `${window.location.origin}/t/${encodeURIComponent(randomTicket.ticketPublicId)}`,
          );
        } else {
          setPreviewQrPayload(`${window.location.origin}/t/${encodeURIComponent(created.accessCode)}`);
        }
      } catch {
        setPreviewQrPayload(`${window.location.origin}/t/${encodeURIComponent(created.accessCode)}`);
      }

      if (settings.deliveryMethod === "EMAIL_LINK") {
        const emails = parseRecipientEmails(settings.recipientEmails);
        if (!emails.length) {
          setError("Event created. Add recipient emails, then click Send tickets.");
          return;
        }
        const sendRes = await api.post(`/orders/${encodeURIComponent(created.accessCode)}/send-links`, {
          emails,
          baseUrl: window.location.origin,
        });
        setSendSummary(sendRes.data);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not create demo event.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!result?.eventId) return;
    setError("");
    try {
      const response = await api.get(`/events/${result.eventId}/tickets.pdf`, { responseType: "blob" });
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
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <h1 className="text-3xl font-bold">QR Tickets</h1>
      <p className="mt-2 text-slate-600">
        Edit your ticket sample directly. Then generate demo tickets and deliver via PDF or email links.
      </p>

      <div className="mt-6">
        <TicketPreview
          ticketDesign={ticketDesign}
          previewQrPayload={previewQrPayload}
          onTicketDesignChange={setTicketDesign}
          onHeaderImageUpload={onHeaderImageUpload}
          onRemoveHeaderImage={() => setTicketDesign((prev) => ({ ...prev, headerImageDataUrl: null }))}
        />
      </div>

      <TicketSettingsForm
        settings={{ ...settings, quantity: totalQuantity }}
        onSettingsChange={updateSettings}
        onTryDemo={tryDemo}
        onSendTickets={() => sendTicketLinks(result?.accessCode)}
        loading={loading}
        sending={sending}
        canSendTickets={Boolean(result?.accessCode && settings.deliveryMethod === "EMAIL_LINK")}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {sendSummary ? (
        <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm">
          <p>Links sent: {sendSummary.sent}</p>
          <p>Failed: {sendSummary.failed?.length || 0}</p>
        </div>
      ) : null}

      {result?.accessCode ? (
        <section className="mt-6 rounded border bg-white p-4">
          <p className="text-sm text-slate-600">Event access code</p>
          <p className="text-3xl font-bold tracking-wider">{result.accessCode}</p>
          <p className="mt-2 text-sm text-amber-700">
            Save this code now. It is very important. Do not share it with anyone. You will use it to access the event dashboard and open the scanner.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded bg-blue-600 px-3 py-2 text-white"
              onClick={() => navigate(`/dashboard?code=${result.accessCode}`)}
            >
              Go to Dashboard
            </button>
            <button
              className="rounded bg-green-600 px-3 py-2 text-white"
              onClick={() => navigate(`/scanner?code=${result.accessCode}`)}
            >
              Open Scanner
            </button>
            {settings.deliveryMethod === "PDF" ? (
              <button className="rounded border px-3 py-2" onClick={downloadPdf}>
                Download Tickets PDF
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
