import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";

const DELIVERY_METHODS = {
  PDF: "PDF",
  EMAIL_LINK: "EMAIL_LINK",
};
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
<div style="text-align:center;line-height:1.5;">
  <p style="margin:0 0 16px 0;">Hello,</p>
  <p style="margin:0 0 16px 0;">Your <strong>{{ticketType}}</strong> ticket for <strong>{{eventName}}</strong> is ready.</p>
  <p style="margin:0 0 4px 0;">Event: <strong>{{eventName}}</strong></p>
  <p style="margin:0 0 4px 0;">Date: <strong>{{eventDate}}</strong></p>
  <p style="margin:0 0 18px 0;">Location: <strong>{{eventAddress}}</strong></p>
  <div style="text-align:center;margin:14px 0;">
    <a href="{{ticketUrl}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">View Your Ticket</a>
  </div>
  <p style="margin:0 0 6px 0;">If the button does not work, use this link:</p>
  <p style="margin:0 0 16px 0;">
    <a href="{{ticketUrl}}" target="_blank" rel="noopener noreferrer" style="color:#2d5bd1;word-break:break-all;text-decoration:none;font-weight:700;">{{ticketUrl}}</a>
  </p>
  <p style="margin:0 0 10px 0;">This ticket was sent to <strong>{{recipientEmail}}</strong>.</p>
  <p style="margin:0;">Please present the QR code at the entrance.</p>
</div>
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

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS.PDF);
  const [pdfTicketsPerPage, setPdfTicketsPerPage] = useState(2);
  const [recipientEmails, setRecipientEmails] = useState("");
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [showEmailPreview, setShowEmailPreview] = useState(true);
  const [sendSummary, setSendSummary] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });

  const recipientList = parseRecipientEmails(recipientEmails);
  const sampleRecipient = recipientList[0] || "customer@example.com";
  const sampleTicketPublicId = tickets[0]?.ticketPublicId || "TICKET-PUBLIC-ID";
  const sampleData = {
    eventName: summary?.event?.eventName || "Your Event",
    eventDate: summary?.event?.eventDate ? new Date(summary.event.eventDate).toLocaleString() : "Event date",
    eventAddress: summary?.event?.eventAddress || "Event address",
    ticketType: summary?.event?.ticketType || "General",
    ticketUrl: `${window.location.origin}/t/${sampleTicketPublicId}`,
    recipientEmail: sampleRecipient,
  };
  const previewSubject = renderEmailTemplate(emailSubject, sampleData);
  const previewBody = renderEmailTemplate(emailBody, sampleData);
  const previewBodyHtml =
    emailBody === DEFAULT_EMAIL_BODY
      ? renderEmailTemplate(DEFAULT_EMAIL_HTML_TEMPLATE, sampleData)
      : renderEmailHtmlPreview(previewBody, sampleData.ticketUrl);

  const load = async () => {
    if (!code.trim() || loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    setSendSummary(null);
    setParams({ code: code.trim() });
    try {
      const summaryRes = await withMinDelay(api.get(`/events/by-code/${encodeURIComponent(code.trim())}`));
      setSummary(summaryRes.data);
      const ticketsRes = await api.get(`/events/${summaryRes.data.event.id}/tickets`);
      setTickets(ticketsRes.data.tickets || []);
      setFeedback({ kind: "success", message: "Dashboard loaded." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Unable to load dashboard." });
      setSummary(null);
      setTickets([]);
    } finally {
      setLoading(false);
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
    const accessCode = summary?.event?.accessCode || code.trim();
    if (!accessCode || sending) return;
    if (!recipientList.length) {
      setFeedback({ kind: "error", message: "Add at least one valid recipient email." });
      return;
    }
    if (!emailSubject.trim()) {
      setFeedback({ kind: "error", message: "Email subject cannot be empty." });
      return;
    }
    if (!emailBody.trim()) {
      setFeedback({ kind: "error", message: "Email body cannot be empty." });
      return;
    }

    setSending(true);
    setFeedback({ kind: "", message: "" });
    setSendSummary(null);
    try {
      const response = await withMinDelay(
        api.post(`/orders/${encodeURIComponent(accessCode)}/send-links`, {
          emails: recipientList,
          baseUrl: window.location.origin,
          emailSubject,
          emailBody,
        }),
      );
      setSendSummary(response.data);
      setFeedback({ kind: "success", message: "Email sent." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not send ticket links." });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="mt-4 flex gap-2">
        <input
          className="w-64 rounded border p-2"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
        />
        <AppButton onClick={load} loading={loading} loadingText="Loading..." variant="primary">
          Load
        </AppButton>
      </div>

      <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />

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
          </div>

          <div className="mt-4 rounded border p-4">
            <p className="text-sm font-semibold">Delivery method</p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="deliveryMethod"
                value={DELIVERY_METHODS.PDF}
                checked={deliveryMethod === DELIVERY_METHODS.PDF}
                onChange={(event) => setDeliveryMethod(event.target.value)}
              />
              <span>Download PDF</span>
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="deliveryMethod"
                value={DELIVERY_METHODS.EMAIL_LINK}
                checked={deliveryMethod === DELIVERY_METHODS.EMAIL_LINK}
                onChange={(event) => setDeliveryMethod(event.target.value)}
              />
              <span>Send by email (links)</span>
            </label>

            {deliveryMethod === DELIVERY_METHODS.PDF ? (
              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium">Tickets per page</label>
                <select
                  className="w-44 rounded border p-2 text-sm"
                  value={pdfTicketsPerPage}
                  onChange={(event) => setPdfTicketsPerPage(Number.parseInt(event.target.value, 10) || 2)}
                  disabled={downloading}
                >
                  {PDF_TICKETS_PER_PAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <AppButton
                  className="mt-3"
                  variant="secondary"
                  onClick={downloadPdf}
                  loading={downloading}
                  loadingText="Downloading..."
                >
                  Download Tickets PDF
                </AppButton>
              </div>
            ) : null}

            {deliveryMethod === DELIVERY_METHODS.EMAIL_LINK ? (
              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium">Recipient emails</label>
                <textarea
                  className="w-full rounded border p-2"
                  rows={4}
                  value={recipientEmails}
                  onChange={(event) => setRecipientEmails(event.target.value)}
                  placeholder="alice@email.com, bob@email.com"
                />
                <p className="mt-1 text-xs text-slate-600">We&apos;ll send one ticket link per email.</p>

                <div className="mt-4 rounded border bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Email content preview editor</p>
                    <div className="flex gap-2">
                      <AppButton
                        type="button"
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => setShowEmailPreview((prev) => !prev)}
                      >
                        {showEmailPreview ? "Hide preview" : "Show preview"}
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        onClick={() => {
                          setEmailSubject(DEFAULT_EMAIL_SUBJECT);
                          setEmailBody(DEFAULT_EMAIL_BODY);
                        }}
                      >
                        Reset template
                      </AppButton>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-600">
                    Available placeholders: {EMAIL_TEMPLATE_HELP.join(", ")}
                  </p>

                  <label className="mt-3 block text-xs font-medium text-slate-700">Email subject</label>
                  <input
                    className="mt-1 w-full rounded border p-2 text-sm"
                    value={emailSubject}
                    onChange={(event) => setEmailSubject(event.target.value)}
                    placeholder="Your ticket for {{eventName}}"
                  />

                  <label className="mt-3 block text-xs font-medium text-slate-700">Email body</label>
                  <textarea
                    className="mt-1 w-full rounded border p-2 text-sm font-mono"
                    rows={8}
                    value={emailBody}
                    onChange={(event) => setEmailBody(event.target.value)}
                  />

                  {showEmailPreview ? (
                    <div className="mt-3 rounded border bg-white p-3 text-sm">
                      <p className="text-xs text-slate-500">To: {sampleRecipient}</p>
                      <p className="mt-2">
                        <span className="font-semibold">Subject:</span> {previewSubject}
                      </p>
                      <div
                        className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700"
                        dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
                      />
                    </div>
                  ) : null}
                </div>

                <AppButton
                  className="mt-3"
                  variant="indigo"
                  onClick={sendTicketLinks}
                  loading={sending}
                  loadingText="Sending..."
                >
                  Send tickets
                </AppButton>
              </div>
            ) : null}
          </div>

          {sendSummary ? (
            <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm">
              <p>Links sent: {sendSummary.sent}</p>
              <p>Failed: {sendSummary.failed?.length || 0}</p>
            </div>
          ) : null}

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
