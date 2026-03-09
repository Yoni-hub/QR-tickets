import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";
import TicketEditor from "../components/ticket-editor/TicketEditor";

const DELIVERY_METHODS = {
  PDF: "PDF",
  EMAIL_LINK: "EMAIL_LINK",
};

const DASHBOARD_MENUS = [
  { id: "tickets", label: "Tickets" },
  { id: "events", label: "Events" },
  { id: "delivery", label: "Delivery Method" },
  { id: "requests", label: "Ticket Requests" },
  { id: "promoters", label: "Promoters" },
];

const PDF_TICKETS_PER_PAGE_OPTIONS = [1, 2, 3, 4];
const DEFAULT_EMAIL_SUBJECT = "Your ticket for {{eventName}}";
const DEFAULT_EMAIL_BODY = [
  "Hello,",
  "",
  "Your {{ticketType}} ticket for {{eventName}} is ready.",
  "",
  "Event: {{eventName}}",
  "Date: {{eventDate}}",
  "Location: {{eventAddress}}",
  "",
  "Click the button below to view your ticket.",
  "[ View Your Ticket ]",
  "",
  "If the button does not work, use this link:",
  "{{ticketUrl}}",
  "",
  "This ticket was sent to {{recipientEmail}}.",
  "Please present the QR code at the entrance.",
].join("\n");

const DEFAULT_EMAIL_HTML_TEMPLATE = `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;padding:16px 0;">
  <tr>
    <td align="center">
      <table width="520" cellpadding="24" cellspacing="0" role="presentation" style="background:#f5f7fb;border-radius:8px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <tr>
          <td align="center">
            <p style="margin:0 0 18px 0;font-size:20px;font-weight:700;">Ticket Confirmed</p>
            <p style="margin:0 0 16px 0;">Hello,</p>
            <p style="margin:0 0 20px 0;">Your <strong>{{ticketType}}</strong> ticket for <strong>{{eventName}}</strong> is ready.</p>
            <p style="text-align:center;margin:20px 0;"><a href="{{ticketUrl}}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">View Your Ticket</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

const EMAIL_TEMPLATE_HELP = [
  "{{eventName}}",
  "{{eventDate}}",
  "{{eventAddress}}",
  "{{ticketType}}",
  "{{ticketUrl}}",
  "{{recipientEmail}}",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TICKET_TYPE = "General";

function parseRecipientEmails(rawValue) {
  return String(rawValue || "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry, index, arr) => EMAIL_PATTERN.test(entry) && arr.indexOf(entry) === index);
}

function renderEmailTemplate(template, values) {
  const replacements = {
    "{{eventName}}": String(values.eventName || ""),
    "{{eventDate}}": String(values.eventDate || ""),
    "{{eventAddress}}": String(values.eventAddress || ""),
    "{{ticketType}}": String(values.ticketType || "General"),
    "{{ticketUrl}}": String(values.ticketUrl || ""),
    "{{recipientEmail}}": String(values.recipientEmail || ""),
  };

  return Object.entries(replacements).reduce(
    (acc, [token, tokenValue]) => acc.split(token).join(tokenValue),
    String(template || ""),
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEmailHtmlPreview(textBody, ticketUrl) {
  const buttonToken = "__VIEW_TICKET_BUTTON__";
  const safeText = escapeHtml(textBody).replaceAll("[ View Your Ticket ]", buttonToken);
  const safeTicketUrl = escapeHtml(ticketUrl);
  const buttonHtml = `<div style="text-align:center;margin:14px 0;"><a href="${safeTicketUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">View Your Ticket</a></div>`;
  const content = safeText.replaceAll("\n", "<br />").replaceAll(buttonToken, buttonHtml);
  return `<div style="text-align:center;line-height:1.5;">${content}</div>`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function toLocalDateTimeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function normalizeTicketPrice(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveDefaultTicketType(value) {
  return String(value || "").trim() || DEFAULT_TICKET_TYPE;
}

function buildDefaultEmailSubject(ticketType) {
  return `Your ${resolveDefaultTicketType(ticketType)} ticket for {{eventName}}`;
}

function buildDefaultEmailBody(ticketType) {
  return DEFAULT_EMAIL_BODY.replace(
    "Your {{ticketType}} ticket for {{eventName}} is ready.",
    `Your ${resolveDefaultTicketType(ticketType)} ticket for {{eventName}} is ready.`,
  );
}

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const [activeMenu, setActiveMenu] = useState("tickets");
  const [code, setCode] = useState(params.get("code") || "");
  const [showPublicPreview, setShowPublicPreview] = useState(false);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketTypeFilter, setTicketTypeFilter] = useState("ALL");
  const [summary, setSummary] = useState(null);
  const [eventDraft, setEventDraft] = useState({ eventName: "", eventDate: "", eventAddress: "", paymentInstructions: "" });
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingTicketDraft, setSavingTicketDraft] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketRequests, setTicketRequests] = useState([]);
  const [promoters, setPromoters] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS.PDF);
  const [pdfTicketsPerPage, setPdfTicketsPerPage] = useState(2);
  const [deliveryTicketType, setDeliveryTicketType] = useState("");
  const [recipientEmails, setRecipientEmails] = useState("");
  const [emailTemplatesByType, setEmailTemplatesByType] = useState({});
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [showEmailPreview, setShowEmailPreview] = useState(true);
  const [sendSummary, setSendSummary] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [promoterForm, setPromoterForm] = useState({ name: "", code: "" });

  const recipientList = parseRecipientEmails(recipientEmails);
  const sampleRecipient = recipientList[0] || "customer@example.com";
  const sampleTicketPublicId =
    tickets.find((ticket) => resolveDefaultTicketType(ticket.ticketType || summary?.event?.ticketType) === deliveryTicketType)?.ticketPublicId
    || tickets[0]?.ticketPublicId
    || "TICKET-PUBLIC-ID";
  const sampleData = {
    eventName: summary?.event?.eventName || "Your Event",
    eventDate: summary?.event?.eventDate ? new Date(summary.event.eventDate).toLocaleString() : "Event date",
    eventAddress: summary?.event?.eventAddress || "Event address",
    ticketType: deliveryTicketType || tickets[0]?.ticketType || summary?.event?.ticketType || DEFAULT_TICKET_TYPE,
    ticketUrl: `${window.location.origin}/t/${sampleTicketPublicId}`,
    recipientEmail: sampleRecipient,
  };
  const previewSubject = renderEmailTemplate(emailSubject, sampleData);
  const previewBody = renderEmailTemplate(emailBody, sampleData);
  const previewBodyHtml =
    emailBody === DEFAULT_EMAIL_BODY
      ? renderEmailTemplate(DEFAULT_EMAIL_HTML_TEMPLATE, sampleData)
      : renderEmailHtmlPreview(previewBody, sampleData.ticketUrl);

  const accessCode = useMemo(() => summary?.event?.accessCode || code.trim(), [summary, code]);
  const ticketTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          tickets
            .map((ticket) => String(ticket.ticketType || summary?.event?.ticketType || "General").trim())
            .filter(Boolean),
        ),
      ),
    [tickets, summary?.event?.ticketType],
  );
  const deliveryTicketTypeOptions = useMemo(() => {
    if (ticketTypeOptions.length) return ticketTypeOptions;
    return [resolveDefaultTicketType(summary?.event?.ticketType)];
  }, [ticketTypeOptions, summary?.event?.ticketType]);

  useEffect(() => {
    if (!deliveryTicketTypeOptions.length) return;
    setDeliveryTicketType((prev) =>
      prev && deliveryTicketTypeOptions.includes(prev) ? prev : deliveryTicketTypeOptions[0],
    );
  }, [deliveryTicketTypeOptions]);

  useEffect(() => {
    if (!deliveryTicketTypeOptions.length) return;
    setEmailTemplatesByType((prev) => {
      const next = { ...prev };
      for (const ticketType of deliveryTicketTypeOptions) {
        if (!next[ticketType]) {
          next[ticketType] = {
            subject: buildDefaultEmailSubject(ticketType),
            body: buildDefaultEmailBody(ticketType),
          };
        }
      }
      return next;
    });
  }, [deliveryTicketTypeOptions]);

  useEffect(() => {
    const ticketType = deliveryTicketType || deliveryTicketTypeOptions[0];
    if (!ticketType) return;
    const template = emailTemplatesByType[ticketType] || {
      subject: buildDefaultEmailSubject(ticketType),
      body: buildDefaultEmailBody(ticketType),
    };
    setEmailSubject(template.subject);
    setEmailBody(template.body);
  }, [deliveryTicketType, deliveryTicketTypeOptions, emailTemplatesByType]);
  const filteredTickets = useMemo(() => {
    if (ticketTypeFilter === "ALL") return tickets;
    return tickets.filter(
      (ticket) => String(ticket.ticketType || summary?.event?.ticketType || "General").trim() === ticketTypeFilter,
    );
  }, [tickets, ticketTypeFilter, summary?.event?.ticketType]);
  const totalTicketPages = Math.max(1, Math.ceil(filteredTickets.length / 5));
  const pagedTickets = filteredTickets.slice((ticketPage - 1) * 5, ticketPage * 5);
  useEffect(() => {
    if (ticketPage > totalTicketPages) setTicketPage(totalTicketPages);
  }, [ticketPage, totalTicketPages]);
  useEffect(() => {
    setTicketPage(1);
  }, [ticketTypeFilter]);

  const loadRequestsAndPromoters = async (targetCode) => {
    if (!targetCode) return;
    const [requestRes, promoterRes] = await Promise.all([
      api.get(`/events/by-code/${encodeURIComponent(targetCode)}/ticket-requests`),
      api.get(`/events/by-code/${encodeURIComponent(targetCode)}/promoters`),
    ]);
    setTicketRequests(requestRes.data.items || []);
    setPromoters(promoterRes.data.items || []);
    setLeaderboard(promoterRes.data.leaderboard || []);
  };

  const load = async () => {
    if (!code.trim() || loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    setSendSummary(null);
    setParams({ code: code.trim() });
    try {
      const summaryRes = await withMinDelay(api.get(`/events/by-code/${encodeURIComponent(code.trim())}`));
      setSummary(summaryRes.data);
      setEventDraft({
        eventName: String(summaryRes.data?.event?.eventName || ""),
        eventDate: toLocalDateTimeInputValue(summaryRes.data?.event?.eventDate),
        eventAddress: String(summaryRes.data?.event?.eventAddress || ""),
        paymentInstructions: String(summaryRes.data?.event?.paymentInstructions || ""),
      });
      setTicketTypeFilter("ALL");
      setActiveMenu("tickets");
      setShowPublicPreview(false);
      setTicketPage(1);
      const ticketsRes = await api.get(`/events/${summaryRes.data.event.id}/tickets`);
      setTickets(ticketsRes.data.tickets || []);
      await loadRequestsAndPromoters(summaryRes.data.event.accessCode);
      setFeedback({ kind: "success", message: "Dashboard loaded." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Unable to load dashboard." });
      setSummary(null);
      setTickets([]);
      setTicketRequests([]);
      setPromoters([]);
      setLeaderboard([]);
      setTicketTypeFilter("ALL");
    } finally {
      setLoading(false);
    }
  };

  const copyTicketUrl = async (ticketPublicId) => {
    const url = `${window.location.origin}/t/${ticketPublicId}`;
    await navigator.clipboard.writeText(url);
    setFeedback({ kind: "success", message: "Ticket URL copied." });
  };

  const approveRequest = async (requestId) => {
    try {
      await api.post(`/ticket-requests/${encodeURIComponent(requestId)}/approve`, { accessCode });
      await loadRequestsAndPromoters(accessCode);
      const ticketsRes = await api.get(`/events/${summary.event.id}/tickets`);
      setTickets(ticketsRes.data.tickets || []);
      setFeedback({ kind: "success", message: "Request approved and ticket generated." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Approve failed." });
    }
  };

  const rejectRequest = async (requestId) => {
    try {
      await api.post(`/ticket-requests/${encodeURIComponent(requestId)}/reject`, { accessCode });
      await loadRequestsAndPromoters(accessCode);
      setFeedback({ kind: "info", message: "Request rejected." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Reject failed." });
    }
  };

  const addPromoter = async () => {
    if (!promoterForm.name.trim()) {
      setFeedback({ kind: "error", message: "Promoter name is required." });
      return;
    }

    try {
      await api.post("/promoters", { accessCode, name: promoterForm.name, code: promoterForm.code });
      setPromoterForm({ name: "", code: "" });
      await loadRequestsAndPromoters(accessCode);
      setFeedback({ kind: "success", message: "Promoter added." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not add promoter." });
    }
  };

  const deletePromoter = async (promoterId) => {
    try {
      await api.delete(`/promoters/${encodeURIComponent(promoterId)}`, { data: { accessCode } });
      await loadRequestsAndPromoters(accessCode);
      setFeedback({ kind: "info", message: "Promoter deleted." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Delete failed." });
    }
  };

  const downloadPdf = async () => {
    if (!summary?.event?.id || downloading) return;
    setDownloading(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await withMinDelay(
        api.get(`/events/${summary.event.id}/tickets.pdf`, {
          responseType: "blob",
          params: { perPage: pdfTicketsPerPage },
        }),
      );
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
      setFeedback({ kind: "success", message: "Tickets PDF downloaded." });
    } catch (requestError) {
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || requestError.message || "Could not download tickets PDF.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const sendTicketLinks = async () => {
    if (!accessCode || sending) return;
    if (!deliveryTicketType) {
      setFeedback({ kind: "error", message: "Select a ticket type first." });
      return;
    }
    if (!recipientList.length) {
      setFeedback({ kind: "error", message: "Add at least one valid recipient email." });
      return;
    }
    if (!emailSubject.trim() || !emailBody.trim()) {
      setFeedback({ kind: "error", message: "Email subject and body cannot be empty." });
      return;
    }

    setSending(true);
    setFeedback({ kind: "", message: "" });
    setSendSummary(null);
    try {
      const response = await withMinDelay(
        api.post(`/orders/${encodeURIComponent(accessCode)}/send-links`, {
          emails: recipientList,
          ticketType: deliveryTicketType,
          baseUrl: window.location.origin,
          emailSubject,
          emailBody,
        }),
      );
      setSendSummary(response.data);
      setRecipientEmails("");
      setFeedback({ kind: "success", message: `Email sent for ${deliveryTicketType}.` });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not send ticket links." });
    } finally {
      setSending(false);
    }
  };

  const handleTicketsGenerated = async () => {
    if (!summary?.event?.id || !accessCode) return;
    const [summaryRes, ticketsRes] = await Promise.all([
      api.get(`/events/by-code/${encodeURIComponent(accessCode)}`),
      api.get(`/events/${summary.event.id}/tickets`),
    ]);
    setSummary(summaryRes.data);
    setTickets(ticketsRes.data.tickets || []);
    setTicketPage(1);
  };

  const saveEventInline = async () => {
    if (!summary?.event?.id || !accessCode || savingEvent) return;
    setSavingEvent(true);
    try {
      const response = await api.patch(`/events/${summary.event.id}`, {
        accessCode,
        eventName: eventDraft.eventName,
        eventDate: eventDraft.eventDate,
        eventAddress: eventDraft.eventAddress,
        paymentInstructions: eventDraft.paymentInstructions,
      });
      setSummary((prev) => {
        if (!prev) return prev;
        return { ...prev, event: { ...prev.event, ...response.data.event } };
      });
      setFeedback({ kind: "success", message: "Event details updated." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not update event." });
    } finally {
      setSavingEvent(false);
    }
  };

  const applyTicketEditorDraft = (draft) => {
    if (!draft) return;
    setSummary((prev) => {
      if (!prev?.event) return prev;
      return {
        ...prev,
        event: {
          ...prev.event,
          eventName: draft.eventName || prev.event.eventName,
          eventAddress: draft.eventAddress || prev.event.eventAddress,
          ...(draft.eventDate ? { eventDate: draft.eventDate } : {}),
          ticketType: draft.ticketType || prev.event.ticketType,
          ticketPrice: normalizeTicketPrice(draft.ticketPrice),
          ...(draft.designJson ? { designJson: draft.designJson } : {}),
        },
      };
    });

    setEventDraft((prev) => ({
      ...prev,
      ...(draft.eventName ? { eventName: draft.eventName } : {}),
      ...(draft.eventAddress ? { eventAddress: draft.eventAddress } : {}),
      ...(draft.eventDate ? { eventDate: toLocalDateTimeInputValue(draft.eventDate) } : {}),
    }));
  };

  const saveTicketEditorDraft = async (draft) => {
    if (!summary?.event?.id || !accessCode || savingTicketDraft) return;
    setSavingTicketDraft(true);
    try {
      const payload = {
        accessCode,
        eventName: draft?.eventName || summary.event.eventName,
        eventAddress: draft?.eventAddress || summary.event.eventAddress,
        ticketType: draft?.ticketType || summary.event.ticketType || "",
        ticketPrice: draft?.ticketPrice ?? summary.event.ticketPrice ?? "",
        designJson: draft?.designJson || summary.event.designJson || null,
      };
      if (draft?.eventDate) {
        payload.eventDate = draft.eventDate;
      }

      const response = await api.patch(`/events/${summary.event.id}`, payload);
      setSummary((prev) => {
        if (!prev) return prev;
        return { ...prev, event: { ...prev.event, ...response.data.event } };
      });
      setEventDraft({
        eventName: String(response.data?.event?.eventName || ""),
        eventDate: toLocalDateTimeInputValue(response.data?.event?.eventDate),
        eventAddress: String(response.data?.event?.eventAddress || ""),
        paymentInstructions: String(response.data?.event?.paymentInstructions || ""),
      });
      setFeedback({ kind: "success", message: "Ticket editor changes saved." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not save ticket changes." });
    } finally {
      setSavingTicketDraft(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
        <span className="rounded border bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
          Current Access Code: <span className="font-mono">{accessCode || "-"}</span>
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input className="w-full rounded border p-2" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" />
        <AppButton onClick={load} loading={loading} loadingText="Loading..." variant="primary">Load</AppButton>
      </div>

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

      {summary ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
            {DASHBOARD_MENUS.map((menu) => (
              <button
                key={menu.id}
                type="button"
                onClick={() => setActiveMenu(menu.id)}
                className={`rounded border px-3 py-1.5 ${activeMenu === menu.id ? "bg-slate-900 text-white" : "bg-white text-slate-800"}`}
              >
                {menu.label}
              </button>
            ))}
          </div>

          {activeMenu === "events" ? (
            <section className="mt-4 rounded border p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_1fr] sm:items-center">
                <p className="font-semibold">Event:</p>
                <input
                  className="w-full rounded border p-2 text-sm"
                  value={eventDraft.eventName}
                  onChange={(e) => setEventDraft((prev) => ({ ...prev, eventName: e.target.value }))}
                />
                <p className="font-semibold">Date:</p>
                <input
                  type="datetime-local"
                  className="w-full rounded border p-2 text-sm"
                  value={eventDraft.eventDate}
                  onChange={(e) => setEventDraft((prev) => ({ ...prev, eventDate: e.target.value }))}
                />
                <p className="font-semibold">Location:</p>
                <input
                  className="w-full rounded border p-2 text-sm"
                  value={eventDraft.eventAddress}
                  onChange={(e) => setEventDraft((prev) => ({ ...prev, eventAddress: e.target.value }))}
                />
                <p className="font-semibold">Payment:</p>
                <textarea
                  className="w-full rounded border p-2 text-sm"
                  rows={3}
                  placeholder="How should clients pay? (e.g. CashApp $..., Zelle ..., bank transfer...)"
                  value={eventDraft.paymentInstructions}
                  onChange={(e) => setEventDraft((prev) => ({ ...prev, paymentInstructions: e.target.value }))}
                />
              </div>
              <AppButton className="mt-3" onClick={saveEventInline} loading={savingEvent} loadingText="Saving...">
                Save Event
              </AppButton>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="break-all"><span className="font-semibold">Public Event Link:</span> {summary.event.slug ? `${window.location.origin}/e/${summary.event.slug}` : "Not available"}</p>
                {summary.event.slug ? (
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/e/${summary.event.slug}`);
                      setFeedback({ kind: "success", message: "Public event link copied." });
                    }}
                  >
                    Copy
                  </button>
                ) : null}
              </div>
              {summary.event.slug ? (
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    className="inline-flex rounded border bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowPublicPreview((prev) => !prev)}
                  >
                    {showPublicPreview ? "Hide" : "Preview Public Event Page"}
                  </button>
                  {showPublicPreview ? (
                    <div className="max-w-xl rounded border bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Public Event Page Sample</p>
                      <h3 className="mt-2 text-xl font-bold">{eventDraft.eventName || summary.event.eventName}</h3>
                      <p className="mt-1 text-sm text-slate-600">{formatDate(eventDraft.eventDate || summary.event.eventDate)} | {eventDraft.eventAddress || summary.event.eventAddress}</p>
                      <p className="mt-1 text-sm">Price: {summary.event.ticketPrice ? `$${summary.event.ticketPrice}` : "Ask organizer"}</p>
                      <p className="mt-1 text-sm">Tickets remaining: {summary.remainingTickets}</p>
                      <div className="mt-3 border-t pt-3">
                        <p className="text-sm font-semibold">Request Tickets</p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input className="rounded border bg-white p-2 text-sm" value="Customer Name" readOnly />
                          <input className="rounded border bg-white p-2 text-sm" value="Phone (optional)" readOnly />
                          <input className="rounded border bg-white p-2 text-sm sm:col-span-2" value="Email (optional)" readOnly />
                          <input className="rounded border bg-white p-2 text-sm" value="1" readOnly />
                        </div>
                        <button type="button" className="mt-3 rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white" disabled>
                          Request Tickets
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeMenu === "tickets" ? (
            <section className="mt-4 rounded border p-4">
              <div className="mb-5">
                <TicketEditor
                  key={summary.event.id}
                  mode="append_to_event"
                  accessCode={accessCode}
                  eventId={summary.event.id}
                  initialEventName={summary.event.eventName}
                  initialEventAddress={summary.event.eventAddress}
                  initialDateTimeText={formatDate(summary.event.eventDate)}
                  initialTicketType={summary.event.ticketType || "General"}
                  initialTicketPrice={summary.event.ticketPrice || ""}
                  onGenerated={handleTicketsGenerated}
                  onDraftChange={applyTicketEditorDraft}
                  onSave={saveTicketEditorDraft}
                  saveLoading={savingTicketDraft}
                />
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded border bg-white p-2 text-center"><p className="text-[10px] uppercase text-slate-500">Total</p><p className="text-lg font-bold leading-none">{summary.totalTickets}</p></div>
                <div className="rounded border bg-white p-2 text-center"><p className="text-[10px] uppercase text-slate-500">Scanned</p><p className="text-lg font-bold leading-none">{summary.scannedTickets}</p></div>
                <div className="rounded border bg-white p-2 text-center"><p className="text-[10px] uppercase text-slate-500">Remaining</p><p className="text-lg font-bold leading-none">{summary.remainingTickets}</p></div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold">Generated tickets</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">Filter type</label>
                  <select
                    className="rounded border p-1.5 text-xs"
                    value={ticketTypeFilter}
                    onChange={(event) => setTicketTypeFilter(event.target.value)}
                  >
                    <option value="ALL">All types</option>
                    {ticketTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 space-y-3 lg:hidden">
                {pagedTickets.map((ticket) => (
                  <article key={ticket.ticketPublicId} className="rounded border bg-white p-3 text-sm">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <p>ticket id</p>
                      <p>ticket type</p>
                      <p>sold</p>
                      <p>status</p>
                      <p>scanned at</p>
                    </div>
                    <div className="mt-1 grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 text-xs text-slate-900">
                      <p className="break-all font-mono">{ticket.ticketPublicId}</p>
                      <p>{ticket.ticketType || summary.event.ticketType || "General"}</p>
                      <p>{ticket.ticketRequestId ? "YES" : "NO"}</p>
                      <p>{ticket.status}</p>
                      <p>{formatDate(ticket.scannedAt)}</p>
                    </div>
                    <button className="mt-2 rounded border px-2 py-1 text-xs" onClick={() => copyTicketUrl(ticket.ticketPublicId)}>Copy</button>
                  </article>
                ))}
                {!pagedTickets.length ? <p className="text-sm text-slate-500">No tickets for selected type.</p> : null}
              </div>
              <div className="mt-3 hidden overflow-x-auto rounded border lg:block">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-slate-100"><tr><th className="p-2">Ticket ID</th><th className="p-2">Ticket Type</th><th className="p-2">Sold</th><th className="p-2">Status</th><th className="p-2">Scanned At</th><th className="p-2">Copy</th></tr></thead>
                  <tbody>
                    {pagedTickets.map((ticket) => (
                      <tr key={ticket.ticketPublicId} className="border-t">
                        <td className="break-all p-2 font-mono">{ticket.ticketPublicId}</td>
                        <td className="p-2">{ticket.ticketType || summary.event.ticketType || "General"}</td>
                        <td className="p-2">{ticket.ticketRequestId ? "YES" : "NO"}</td>
                        <td className="p-2">{ticket.status}</td>
                        <td className="p-2">{formatDate(ticket.scannedAt)}</td>
                        <td className="p-2"><button className="rounded border px-2 py-1 text-xs" onClick={() => copyTicketUrl(ticket.ticketPublicId)}>Copy</button></td>
                      </tr>
                    ))}
                    {!pagedTickets.length ? (
                      <tr className="border-t">
                        <td className="p-3 text-slate-500" colSpan={6}>No tickets for selected type.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <p>Page {ticketPage} of {totalTicketPages}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 disabled:opacity-50"
                    onClick={() => setTicketPage((prev) => Math.max(1, prev - 1))}
                    disabled={ticketPage <= 1}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 disabled:opacity-50"
                    onClick={() => setTicketPage((prev) => Math.min(totalTicketPages, prev + 1))}
                    disabled={ticketPage >= totalTicketPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {activeMenu === "delivery" ? (
            <section className="mt-4 rounded border p-4">
              <p className="text-sm font-semibold">Delivery method settings</p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="radio" name="deliveryMethod" value={DELIVERY_METHODS.PDF} checked={deliveryMethod === DELIVERY_METHODS.PDF} onChange={(event) => setDeliveryMethod(event.target.value)} />
                <span>Download PDF</span>
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="radio" name="deliveryMethod" value={DELIVERY_METHODS.EMAIL_LINK} checked={deliveryMethod === DELIVERY_METHODS.EMAIL_LINK} onChange={(event) => setDeliveryMethod(event.target.value)} />
                <span>Send by email (links)</span>
              </label>

              {deliveryMethod === DELIVERY_METHODS.PDF ? (
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-medium">Tickets per page</label>
                  <select className="w-full rounded border p-2 text-sm sm:w-44" value={pdfTicketsPerPage} onChange={(event) => setPdfTicketsPerPage(Number.parseInt(event.target.value, 10) || 2)} disabled={downloading}>
                    {PDF_TICKETS_PER_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <AppButton className="mt-3" variant="secondary" onClick={downloadPdf} loading={downloading} loadingText="Downloading...">Download Tickets PDF</AppButton>
                </div>
              ) : null}

              {deliveryMethod === DELIVERY_METHODS.EMAIL_LINK ? (
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-medium">Ticket type</label>
                  <select
                    className="w-full rounded border p-2 text-sm sm:w-72"
                    value={deliveryTicketType}
                    onChange={(event) => setDeliveryTicketType(event.target.value)}
                  >
                    {deliveryTicketTypeOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>

                  <label className="mb-1 mt-3 block text-sm font-medium">Recipient emails ({deliveryTicketType || DEFAULT_TICKET_TYPE})</label>
                  <textarea className="w-full rounded border p-2" rows={4} value={recipientEmails} onChange={(event) => setRecipientEmails(event.target.value)} placeholder="alice@email.com, bob@email.com" />
                  <p className="mt-1 text-xs text-slate-600">Send one ticket type at a time. Group similar buyers together, then switch type for the next batch.</p>

                  <div className="mt-4 rounded border bg-slate-50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold">Email content preview editor</p>
                      <div className="grid grid-cols-1 gap-2 sm:flex">
                        <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setShowEmailPreview((prev) => !prev)}>{showEmailPreview ? "Hide preview" : "Show preview"}</AppButton>
                        <AppButton
                          type="button"
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            const nextTemplate = {
                              subject: buildDefaultEmailSubject(deliveryTicketType || DEFAULT_TICKET_TYPE),
                              body: buildDefaultEmailBody(deliveryTicketType || DEFAULT_TICKET_TYPE),
                            };
                            setEmailTemplatesByType((prev) => ({
                              ...prev,
                              [deliveryTicketType || DEFAULT_TICKET_TYPE]: nextTemplate,
                            }));
                            setEmailSubject(nextTemplate.subject);
                            setEmailBody(nextTemplate.body);
                          }}
                        >
                          Reset template
                        </AppButton>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-slate-600">Available placeholders: {EMAIL_TEMPLATE_HELP.join(", ")}</p>
                    <label className="mt-3 block text-xs font-medium text-slate-700">Email subject</label>
                    <input
                      className="mt-1 w-full rounded border p-2 text-sm"
                      value={emailSubject}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setEmailSubject(nextValue);
                        setEmailTemplatesByType((prev) => ({
                          ...prev,
                          [deliveryTicketType || DEFAULT_TICKET_TYPE]: {
                            subject: nextValue,
                            body: emailBody,
                          },
                        }));
                      }}
                      placeholder="Your ticket for {{eventName}}"
                    />

                    <label className="mt-3 block text-xs font-medium text-slate-700">Email body</label>
                    <textarea
                      className="mt-1 w-full rounded border p-2 text-sm font-mono"
                      rows={8}
                      value={emailBody}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setEmailBody(nextValue);
                        setEmailTemplatesByType((prev) => ({
                          ...prev,
                          [deliveryTicketType || DEFAULT_TICKET_TYPE]: {
                            subject: emailSubject,
                            body: nextValue,
                          },
                        }));
                      }}
                    />

                    {showEmailPreview ? (
                      <div className="mt-3 rounded border bg-white p-3 text-sm">
                        <p className="text-xs text-slate-500">To: {sampleRecipient}</p>
                        <p className="mt-2"><span className="font-semibold">Subject:</span> {previewSubject}</p>
                        <div className="mt-2 overflow-hidden rounded bg-slate-50 p-2 text-sm text-slate-700 [&_a]:break-all [&_table]:max-w-full [&_table]:w-full [&_td]:break-words" dangerouslySetInnerHTML={{ __html: previewBodyHtml }} />
                      </div>
                    ) : null}
                  </div>

                  <AppButton className="mt-3" variant="indigo" onClick={sendTicketLinks} loading={sending} loadingText="Sending...">Send tickets</AppButton>
                </div>
              ) : null}

              {sendSummary ? (
                <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm">
                  <p>Links sent: {sendSummary.sent}</p>
                  <p>Failed: {sendSummary.failed?.length || 0}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeMenu === "requests" ? (
            <section className="mt-4 rounded border p-4">
              <p className="text-sm font-semibold">Ticket requests</p>
              <div className="mt-3 overflow-x-auto rounded border">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Ticket Types</th>
                      <th className="p-2">Quantity</th>
                      <th className="p-2">Evidence</th>
                      <th className="p-2">Ticket ID</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Delivery</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketRequests.map((item) => {
                      const selections = Array.isArray(item.ticketSelections) ? item.ticketSelections : [];
                      return (
                        <tr key={item.id} className="border-t align-top">
                          <td className="p-2 font-semibold">{item.name}</td>
                          <td className="p-2">{item.email || "-"}</td>
                          <td className="p-2">
                            {selections.length
                              ? selections.map((selection) => `${selection.ticketType} x${selection.quantity}`).join(", ")
                              : item.ticketType || "-"}
                          </td>
                          <td className="p-2">{item.quantity}</td>
                          <td className="p-2">
                            {item.evidenceImageDataUrl ? (
                              <a href={item.evidenceImageDataUrl} target="_blank" rel="noreferrer" className="inline-block">
                                <img src={item.evidenceImageDataUrl} alt="Payment evidence" className="h-12 w-12 rounded border object-cover" />
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs break-all">{Array.isArray(item.ticketIds) && item.ticketIds.length ? item.ticketIds.join(", ") : "-"}</td>
                          <td className="p-2">{item.status}</td>
                          <td className="p-2">{item.deliveryStatus || "PENDING"}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-2">
                              <AppButton className="px-2 py-1 text-xs" variant="success" onClick={() => approveRequest(item.id)}>Approve</AppButton>
                              <AppButton className="px-2 py-1 text-xs" variant="danger" onClick={() => rejectRequest(item.id)}>Reject</AppButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!ticketRequests.length ? (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={9}>No ticket requests yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeMenu === "promoters" ? (
            <section className="mt-4 rounded border p-4">
              <p className="text-sm font-semibold">Promoters</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="Name" value={promoterForm.name} onChange={(e) => setPromoterForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Code (optional)" value={promoterForm.code} onChange={(e) => setPromoterForm((prev) => ({ ...prev, code: e.target.value }))} />
              </div>
              <AppButton className="mt-3" onClick={addPromoter}>Add Promoter</AppButton>

              <div className="mt-4 space-y-2">
                {promoters.map((promoter) => (
                  <article key={promoter.id} className="rounded border bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{promoter.name}</p>
                      <p className="font-mono text-xs">{promoter.code}</p>
                    </div>
                    <p className="mt-1 break-all text-xs">{promoter.link}</p>
                    <p className="mt-1 text-xs">Requests: {promoter.requestCount} | Approved: {promoter.approvedTickets} | Scanned: {promoter.scannedEntries}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(promoter.link)}>Copy Link</button>
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => deletePromoter(promoter.id)}>Delete</button>
                    </div>
                  </article>
                ))}
                {!promoters.length ? <p className="text-sm text-slate-500">No promoters yet.</p> : null}
              </div>

              <div className="mt-4 rounded border bg-white p-3 text-sm">
                <p className="font-semibold">Promoter Leaderboard</p>
                <div className="mt-2 space-y-1">
                  {leaderboard.map((row, index) => (
                    <div key={row.promoterId} className="flex items-center justify-between rounded border p-2">
                      <p>{index + 1}. {row.name}</p>
                      <p className="font-semibold">{row.ticketsSold}</p>
                    </div>
                  ))}
                  {!leaderboard.length ? <p className="text-slate-500">No data yet.</p> : null}
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
