import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";
import TicketEditor from "../components/ticket-editor/TicketEditor";
import PublicEventExperience from "../components/public/PublicEventExperience";
import ChatInboxLayout from "../features/chat/ChatInboxLayout";
import { organizerChatApi } from "../features/chat/chatApi";

const DELIVERY_METHODS = {
  PDF: "PDF",
  EMAIL_LINK: "EMAIL_LINK",
  PUBLIC_EVENT_LINK: "PUBLIC_EVENT_LINK",
};

const DASHBOARD_MENUS_ALL = [
  { id: "events", label: "Events" },
  { id: "tickets", label: "Tickets" },
  { id: "delivery", label: "Delivery Method" },
  { id: "requests", label: "Ticket Requests" },
  { id: "chat", label: "Chat" },
  { id: "promoters", label: "Promoters" },
];

const DASHBOARD_MENUS_PRELOAD = [
  { id: "events", label: "Events" },
];

const PDF_TICKETS_PER_PAGE_OPTIONS = [1, 2, 3, 4];
const TICKET_STATUS_FILTERS = {
  TOTAL: "TOTAL",
  SOLD: "SOLD",
  SCANNED: "SCANNED",
  REMAINING: "REMAINING",
};
const DEFAULT_EMAIL_SUBJECT = "Your ticket for {{eventName}}";
const DEFAULT_EMAIL_BODY = [
  "Hello,",
  "",
  "Your {{ticketType}} ticket for {{eventName}} is ready.",
  "",
  "Organizer: {{organizerName}}",
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
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px auto;text-align:left;">
              <tr>
                <td style="padding:4px 10px 4px 0;">Organizer:</td>
                <td><strong>{{organizerName}}</strong></td>
              </tr>
              <tr>
                <td style="padding:4px 10px 4px 0;">Event:</td>
                <td><strong>{{eventName}}</strong></td>
              </tr>
              <tr>
                <td style="padding:4px 10px 4px 0;">Date:</td>
                <td><strong>{{eventDate}}</strong></td>
              </tr>
              <tr>
                <td style="padding:4px 10px 4px 0;">Location:</td>
                <td><strong>{{eventAddress}}</strong></td>
              </tr>
            </table>
            <p style="text-align:center;margin:20px 0;"><a href="{{ticketUrl}}" target="_blank" rel="noopener noreferrer" style="background:#2d5bd1;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">View Your Ticket</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TICKET_TYPE = "General";
const EVENT_EDIT_MODES = {
  EDIT: "EDIT",
  CREATE: "CREATE",
};
const CANCELLATION_REASON_OPTIONS = [
  { value: "EVENT_CANCELLED", label: "Event cancelled" },
  { value: "PAYMENT_REFUNDED_TO_CUSTOMER", label: "Payment refunded to customer" },
  { value: "OTHER", label: "Other" },
];

function getSelectedEventStorageKey(accessCode) {
  return `qr-dashboard:selected-event:${String(accessCode || "").trim()}`;
}

function getDeliveryWarningAckStorageKey(accessCode) {
  return `qr-dashboard:delivery-warning-ack:${String(accessCode || "").trim()}`;
}

function parseRecipientEmails(rawValue) {
  return String(rawValue || "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry, index, arr) => EMAIL_PATTERN.test(entry) && arr.indexOf(entry) === index);
}

function renderEmailTemplate(template, values) {
  const replacements = {
    "{{organizerName}}": String(values.organizerName || ""),
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

function resolveDeliveryMethodLabel(ticket) {
  const method = String(ticket?.deliveryMethod || "NOT_DELIVERED").trim();
  if (method === "PDF_DOWNLOAD") return "PDF";
  if (method === "EMAIL_LINK") return "EMAIL";
  if (method === "PUBLIC_EVENT_PAGE") return "PUBLIC EVENT PAGE";
  return "NOT_DELIVERED";
}

function resolveDeliveryMethodErrorLabel(method) {
  if (method === "PDF") return "PDF download";
  if (method === "EMAIL") return "email";
  if (method === "PUBLIC EVENT PAGE") return "public event page";
  return String(method || "delivery").toLowerCase();
}

function isTicketSold(ticket) {
  const deliveryMethod = String(ticket?.deliveryMethod || "").trim();
  return Boolean(ticket?.ticketRequestId)
    || ticket?.status === "USED"
    || deliveryMethod === "EMAIL_LINK"
    || deliveryMethod === "PDF_DOWNLOAD";
}

function isTicketCancelled(ticket) {
  return Boolean(ticket?.cancelledAt || ticket?.isInvalidated);
}

function resolveCancellationReasonLabel(reason, otherReason = "") {
  if (reason === "EVENT_CANCELLED") return "Event cancelled";
  if (reason === "PAYMENT_REFUNDED_TO_CUSTOMER") return "Payment refunded to customer";
  if (reason === "OTHER") return otherReason || "Other";
  return "-";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function DateTimeInput({ value, onChange, className = "" }) {
  const [datePart, timePart] = String(value || "").split("T");
  const [hStr, mStr] = (timePart || "").split(":");
  const h24 = parseInt(hStr || "", 10);
  const m = parseInt(mStr || "", 10);
  const isPm = !isNaN(h24) && h24 >= 12;
  const h12 = isNaN(h24) ? null : (h24 % 12 || 12);

  const [hourText, setHourText] = useState(() => h12 === null ? "" : String(h12));
  const [minText, setMinText] = useState(() => isNaN(m) ? "" : String(m).padStart(2, "0"));

  useEffect(() => {
    setHourText(h12 === null ? "" : String(h12));
    setMinText(isNaN(m) ? "" : String(m).padStart(2, "0"));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (d, newH24, newM) =>
    onChange(`${d || ""}T${String(newH24 ?? 0).padStart(2, "0")}:${String(newM ?? 0).padStart(2, "0")}`);

  const handleHourChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setHourText(raw);
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= 12) {
      const newH24 = isPm ? (n === 12 ? 12 : n + 12) : (n === 12 ? 0 : n);
      emit(datePart, newH24, isNaN(m) ? 0 : m);
    }
  };

  const handleMinChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setMinText(raw);
    const n = parseInt(raw, 10);
    if (raw.length === 2 && n >= 0 && n <= 59) emit(datePart, isNaN(h24) ? 0 : h24, n);
  };

  const toggleAmPm = () => {
    if (isNaN(h24)) return;
    emit(datePart, isPm ? h24 - 12 : h24 + 12, isNaN(m) ? 0 : m);
  };

  return (
    <div className={`flex w-full items-center rounded border bg-white ${className}`}>
      <input
        type="date"
        value={datePart || ""}
        onChange={(e) => emit(e.target.value, isNaN(h24) ? 0 : h24, isNaN(m) ? 0 : m)}
        className="flex-1 border-0 bg-transparent p-2 text-sm focus:outline-none"
      />
      <div className="flex items-center gap-1 border-l px-2 py-2">
        <input
          type="text"
          inputMode="numeric"
          placeholder="H"
          value={hourText}
          onChange={handleHourChange}
          className="w-7 rounded border bg-slate-50 p-0.5 text-center text-sm font-mono focus:outline-none focus:ring-1 focus:ring-slate-300"
        />
        <span className="text-slate-400">:</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="MM"
          value={minText}
          onChange={handleMinChange}
          className="w-8 rounded border bg-slate-50 p-0.5 text-center text-sm font-mono focus:outline-none focus:ring-1 focus:ring-slate-300"
        />
        <div className="ml-1 flex overflow-hidden rounded border text-xs font-semibold">
          <button type="button" onClick={() => !isPm || toggleAmPm()} className={`px-2 py-0.5 ${!isPm ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>AM</button>
          <button type="button" onClick={() => isPm || toggleAmPm()} className={`px-2 py-0.5 ${isPm ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>PM</button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [activeMenu, setActiveMenu] = useState(() => {
    const initial = String(params.get("menu") || "events").trim().toLowerCase();
    return ["events", "tickets", "delivery", "requests", "chat", "promoters"].includes(initial) ? initial : "events";
  });
  const [code, setCode] = useState(params.get("code") || "");
  const [showPublicPreview, setShowPublicPreview] = useState(false);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketTypeFilter, setTicketTypeFilter] = useState("ALL");
  const [buyerSearch, setBuyerSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState(TICKET_STATUS_FILTERS.TOTAL);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventEditMode, setEventEditMode] = useState(EVENT_EDIT_MODES.CREATE);
  const [eventDraft, setEventDraft] = useState({ organizerName: "", eventName: "", eventDate: "", eventAddress: "", paymentInstructions: "" });
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingTicketDraft, setSavingTicketDraft] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketDeliverySummary, setTicketDeliverySummary] = useState({
    undeliveredTickets: 0,
    pendingRequestedTickets: 0,
    downloadableTickets: 0,
  });
  const [ticketRequests, setTicketRequests] = useState([]);
  const [promoters, setPromoters] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS.PDF);
  const [pdfTicketCount, setPdfTicketCount] = useState(1);
  const [pdfTicketsPerPage, setPdfTicketsPerPage] = useState(2);
  const [deliveryTicketType, setDeliveryTicketType] = useState("");
  const [recipientEmails, setRecipientEmails] = useState("");
  const [emailTemplatesByType, setEmailTemplatesByType] = useState({});
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [sendSummary, setSendSummary] = useState(null);
  const [feedback, setFeedback] = useState({ kind: "", message: "" });
  const [promoterForm, setPromoterForm] = useState({ name: "" });
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [chatContext, setChatContext] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [evidencePreview, setEvidencePreview] = useState("");
  const [approvingRequestIds, setApprovingRequestIds] = useState(() => new Set());
  const [ticketCopyError, setTicketCopyError] = useState({ ticketPublicId: "", message: "" });
  const [ticketCancelError, setTicketCancelError] = useState({ ticketPublicId: "", message: "" });
  const [cancelModal, setCancelModal] = useState({
    open: false,
    ticket: null,
    reason: "",
    evidenceImageDataUrl: "",
    evidenceName: "",
    step: "form",
    loading: false,
    error: "",
  });
  const [generatedOrganizerCodeModal, setGeneratedOrganizerCodeModal] = useState({
    open: false,
    code: "",
    copied: false,
  });
  const [copiedPublicEventLink, setCopiedPublicEventLink] = useState(false);
  const [copiedTicketPublicId, setCopiedTicketPublicId] = useState("");
  const [copiedPromoterId, setCopiedPromoterId] = useState("");
  const [deliveryWarningAcknowledged, setDeliveryWarningAcknowledged] = useState(false);
  const [deliveryWarningModal, setDeliveryWarningModal] = useState({
    open: false,
    action: "",
    payload: null,
  });
  const ticketEditorDraftRef = useRef(null);
  const feedbackRef = useRef(null);
  const organizerNameRef = useRef(null);
  const copyResetTimersRef = useRef({
    publicEventLink: null,
    ticketPublicId: null,
    promoterId: null,
  });

  const recipientList = parseRecipientEmails(recipientEmails);
  const sampleRecipient = recipientList[0] || "customer@example.com";
  const sampleTicketPublicId =
    tickets.find((ticket) => resolveDefaultTicketType(ticket.ticketType || summary?.event?.ticketType) === deliveryTicketType)?.ticketPublicId
    || tickets[0]?.ticketPublicId
    || "TICKET-PUBLIC-ID";
  const sampleData = {
    organizerName: summary?.event?.organizerName || "Organizer name",
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

  const accessCode = useMemo(() => code.trim(), [code]);
  const organizerChatAccessCode = useMemo(() => {
    const fromSummary =
      String(summary?.event?.organizerAccessCode || "").trim()
      || String(summary?.event?.accessCode || "").trim();
    return String(accessCode || fromSummary || "").trim();
  }, [accessCode, summary?.event?.organizerAccessCode, summary?.event?.accessCode]);
  const organizerChatApiClient = useMemo(
    () => ({
      listConversations: (params = {}) => organizerChatApi.listConversations(organizerChatAccessCode, params),
      startConversation: (data) => organizerChatApi.startConversation(organizerChatAccessCode, data),
      listMessages: (conversationId) => organizerChatApi.listMessages(organizerChatAccessCode, conversationId),
      sendMessage: (conversationId, payload) => organizerChatApi.sendMessage(organizerChatAccessCode, conversationId, payload),
      markRead: (conversationId, data) => organizerChatApi.markRead(organizerChatAccessCode, conversationId, data),
    }),
    [organizerChatAccessCode],
  );
  const organizerChatQuickStarts = useMemo(
    () =>
      organizerChatAccessCode
        ? [{
            label: "Message Admin",
            payload: {
              conversationType: "ORGANIZER_ADMIN",
              organizerAccessCode: organizerChatAccessCode,
              eventId: summary?.event?.id || undefined,
            },
          }]
        : [],
    [organizerChatAccessCode, summary?.event?.id],
  );
  const organizerChatListParams = useMemo(
    () => (summary?.event?.id ? { eventId: summary.event.id } : {}),
    [summary?.event?.id],
  );
  const shouldOpenHomeMode = location.pathname === "/";
  const isAccessCodeGenerationMode = !accessCode;
  const showHeroSection = shouldOpenHomeMode && !summary && !accessCode;
  const showLoadDashboard = !shouldOpenHomeMode && !summary;
  const eventPrimaryActionLabel = isAccessCodeGenerationMode ? "Generate Access Code" : "Save Event";
  const eventPrimaryLoadingLabel = isAccessCodeGenerationMode ? "Generating..." : "Saving...";
  const visibleMenus = summary ? DASHBOARD_MENUS_ALL : DASHBOARD_MENUS_PRELOAD;
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
    return tickets.filter((ticket) => {
      const ticketTypeMatches =
        ticketTypeFilter === "ALL"
          || String(ticket.ticketType || summary?.event?.ticketType || "General").trim() === ticketTypeFilter;
      if (!ticketTypeMatches) return false;
      if (buyerSearch.trim()) {
        const buyerValue = String(ticket.buyer || "").toLowerCase();
        if (!buyerValue.includes(buyerSearch.trim().toLowerCase())) return false;
      }

      if (ticketStatusFilter === TICKET_STATUS_FILTERS.SOLD) return isTicketSold(ticket);
      if (ticketStatusFilter === TICKET_STATUS_FILTERS.SCANNED) return ticket.status === "USED";
      if (ticketStatusFilter === TICKET_STATUS_FILTERS.REMAINING) {
        return !isTicketSold(ticket);
      }
      return true;
    });
  }, [tickets, ticketTypeFilter, buyerSearch, ticketStatusFilter, summary?.event?.ticketType]);
  const totalTicketPages = Math.max(1, Math.ceil(filteredTickets.length / 5));
  const pagedTickets = filteredTickets.slice((ticketPage - 1) * 5, ticketPage * 5);
  const soldTicketsCount = useMemo(() => tickets.filter((ticket) => isTicketSold(ticket)).length, [tickets]);
  const scannedTicketsCount = useMemo(() => tickets.filter((ticket) => ticket.status === "USED").length, [tickets]);
  const remainingTicketsCount = useMemo(
    () => tickets.filter((ticket) => !isTicketSold(ticket)).length,
    [tickets],
  );
  const deliverableTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          !ticket.ticketRequestId &&
          ticket.status === "UNUSED" &&
          !ticket.isInvalidated &&
          resolveDeliveryMethodLabel(ticket) === "NOT_DELIVERED",
      ),
    [tickets],
  );
  const deliverableCount = Number.isFinite(ticketDeliverySummary?.downloadableTickets)
    ? Number(ticketDeliverySummary.downloadableTickets)
    : deliverableTickets.length;
  const pendingRequestedCount = Number.isFinite(ticketDeliverySummary?.pendingRequestedTickets)
    ? Number(ticketDeliverySummary.pendingRequestedTickets)
    : 0;
  const pdfDeliveredCount = useMemo(
    () => tickets.filter((ticket) => resolveDeliveryMethodLabel(ticket) === "PDF").length,
    [tickets],
  );
  const noDeliverableTickets = tickets.length > 0 && deliverableCount < 1;

  useEffect(() => {
    if (!shouldOpenHomeMode) return;
    setCode("");
    setFeedback({ kind: "", message: "" });
    setSummary(null);
    setEvents([]);
    setSelectedEventId("");
    setTickets([]);
    setTicketDeliverySummary({ undeliveredTickets: 0, pendingRequestedTickets: 0, downloadableTickets: 0 });
    setTicketRequests([]);
    setPromoters([]);
    setLeaderboard([]);
    setActiveMenu("events");
    setShowPublicPreview(false);
    setEventEditMode(EVENT_EDIT_MODES.CREATE);
    setEventDraft({ organizerName: "", eventName: "", eventDate: "", paymentInstructions: "" });
  }, [shouldOpenHomeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCopiedPublicEventLink(false);
    setCopiedTicketPublicId("");
    setCopiedPromoterId("");
    if (!accessCode) {
      setDeliveryWarningAcknowledged(false);
      return;
    }
    const storageKey = getDeliveryWarningAckStorageKey(accessCode);
    const savedValue = localStorage.getItem(storageKey);
    setDeliveryWarningAcknowledged(savedValue === "1");
  }, [accessCode]);

  useEffect(() => {
    return () => {
      if (copyResetTimersRef.current.publicEventLink) clearTimeout(copyResetTimersRef.current.publicEventLink);
      if (copyResetTimersRef.current.ticketPublicId) clearTimeout(copyResetTimersRef.current.ticketPublicId);
      if (copyResetTimersRef.current.promoterId) clearTimeout(copyResetTimersRef.current.promoterId);
    };
  }, []);

  useEffect(() => {
    if (ticketPage > totalTicketPages) setTicketPage(totalTicketPages);
  }, [ticketPage, totalTicketPages]);
  useEffect(() => {
    setTicketPage(1);
  }, [ticketTypeFilter, buyerSearch, ticketStatusFilter]);
  useEffect(() => {
    if (!chatContext?.id || !accessCode) return undefined;
    const interval = setInterval(() => {
      loadChatMessages(chatContext.id, { silent: true });
    }, 8000);
    return () => clearInterval(interval);
  }, [chatContext?.id, accessCode]);
  useEffect(() => {
    if (!feedback.message) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [feedback.kind, feedback.message]);
  useEffect(() => {
    setPdfTicketCount((prev) => {
      if (deliverableCount < 1) return 1;
      return Math.min(Math.max(1, Number(prev) || 1), deliverableCount);
    });
  }, [deliverableCount]);

  const applySummaryEvent = useCallback((payload) => {
    const nextEvents = Array.isArray(payload?.events) ? payload.events : [];
    setEvents(nextEvents);
    setSelectedEventId(String(payload?.event?.id || ""));
    setSummary(payload);
    setEventDraft({
      organizerName: String(payload?.event?.organizerName || ""),
      eventName: String(payload?.event?.eventName || ""),
      eventDate: toLocalDateTimeInputValue(payload?.event?.eventDate),
      eventAddress: String(payload?.event?.eventAddress || ""),
      paymentInstructions: String(payload?.event?.paymentInstructions || ""),
    });
    setEventEditMode(EVENT_EDIT_MODES.EDIT);
  }, []);

  const handleTicketLockError = useCallback((requestError) => {
    const responseData = requestError?.response?.data || {};
    if (responseData.code !== "EVENT_TICKETS_LOCKED") return false;
    const fallbackMethods = Array.isArray(responseData.deliveryMethods) && responseData.deliveryMethods.length
      ? responseData.deliveryMethods.join(", ")
      : "delivery methods already used";
    const message = responseData.error
      || `You cant make changes on the tickets you already deliverd the tickets in ${fallbackMethods}. Create a new event from the Events menu.`;
    window.alert(message);
    setFeedback({ kind: "error", message });
    return true;
  }, []);

  const loadRequestsAndPromoters = async (targetCode, targetEventId) => {
    if (!targetCode || !targetEventId) return;
    const [requestRes, promoterRes] = await Promise.all([
      api.get(`/events/by-code/${encodeURIComponent(targetCode)}/ticket-requests`, {
        params: { eventId: targetEventId },
      }),
      api.get(`/events/by-code/${encodeURIComponent(targetCode)}/promoters`, {
        params: { eventId: targetEventId },
      }),
    ]);
    setTicketRequests(requestRes.data.items || []);
    setPromoters(promoterRes.data.items || []);
    setLeaderboard(promoterRes.data.leaderboard || []);
  };

  const loadTicketsForEvent = async (eventId) => {
    const ticketsRes = await api.get(`/events/${eventId}/tickets`);
    setTickets(ticketsRes.data.tickets || []);
    setTicketDeliverySummary(
      ticketsRes.data.summary || {
        undeliveredTickets: 0,
        pendingRequestedTickets: 0,
        downloadableTickets: 0,
      },
    );
  };

  const loadDashboard = useCallback(async (targetCode, requestedEventId = "") => {
    const trimmedCode = String(targetCode || "").trim();
    if (!trimmedCode || loading) return;
    setLoading(true);
    setFeedback({ kind: "", message: "" });
    setSendSummary(null);
    setParams({ code: trimmedCode });

    const storageKey = getSelectedEventStorageKey(trimmedCode);
    const storedEventId = requestedEventId || localStorage.getItem(storageKey) || "";

    try {
      const summaryRes = await withMinDelay(api.get(`/events/by-code/${encodeURIComponent(trimmedCode)}`, {
        params: storedEventId ? { eventId: storedEventId } : {},
      }));
      applySummaryEvent(summaryRes.data);
      if (summaryRes.data?.event?.id) {
        localStorage.setItem(storageKey, summaryRes.data.event.id);
      }
      setTicketTypeFilter("ALL");
      setTicketStatusFilter(TICKET_STATUS_FILTERS.TOTAL);
      setActiveMenu("events");
      setShowPublicPreview(false);
      setTicketPage(1);
      await loadTicketsForEvent(summaryRes.data.event.id);
      await loadRequestsAndPromoters(trimmedCode, summaryRes.data.event.id);
      setFeedback({ kind: "success", message: "Dashboard loaded." });
      window.localStorage.setItem("qr-dashboard:loaded-once", "1");
      window.dispatchEvent(new Event("qr-dashboard-nav-updated"));
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Unable to load dashboard." });
      setSummary(null);
      setEvents([]);
      setSelectedEventId("");
      setTickets([]);
      setTicketDeliverySummary({ undeliveredTickets: 0, pendingRequestedTickets: 0, downloadableTickets: 0 });
      setTicketRequests([]);
      setPromoters([]);
      setLeaderboard([]);
      setTicketTypeFilter("ALL");
      setTicketStatusFilter(TICKET_STATUS_FILTERS.TOTAL);
    } finally {
      setLoading(false);
    }
  }, [loading, setParams, applySummaryEvent]);

  const load = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setFeedback({ kind: "info", message: "New here? Fill in your event details to generate your access code." });
      return;
    }
    await loadDashboard(trimmedCode);
  };

  const markCopiedPublicEventLink = () => {
    setCopiedPublicEventLink(true);
    if (copyResetTimersRef.current.publicEventLink) clearTimeout(copyResetTimersRef.current.publicEventLink);
    copyResetTimersRef.current.publicEventLink = setTimeout(() => {
      setCopiedPublicEventLink(false);
    }, 1800);
  };

  const markCopiedTicketPublicId = (ticketPublicId) => {
    setCopiedTicketPublicId(String(ticketPublicId || ""));
    if (copyResetTimersRef.current.ticketPublicId) clearTimeout(copyResetTimersRef.current.ticketPublicId);
    copyResetTimersRef.current.ticketPublicId = setTimeout(() => {
      setCopiedTicketPublicId("");
    }, 1800);
  };

  const markCopiedPromoterId = (promoterId) => {
    setCopiedPromoterId(String(promoterId || ""));
    if (copyResetTimersRef.current.promoterId) clearTimeout(copyResetTimersRef.current.promoterId);
    copyResetTimersRef.current.promoterId = setTimeout(() => {
      setCopiedPromoterId("");
    }, 1800);
  };

  const copyTicketUrl = async (ticket, skipWarning = false) => {
    const method = resolveDeliveryMethodLabel(ticket);
    if (method !== "NOT_DELIVERED") {
      const inlineMessage = `cant copy! ticket already delivered through ${resolveDeliveryMethodErrorLabel(method)}.`;
      setTicketCopyError({
        ticketPublicId: String(ticket?.ticketPublicId || ""),
        message: inlineMessage,
      });
      return;
    }
    const ticketPublicId = ticket?.ticketPublicId;
    if (!ticketPublicId) return;
    if (!deliveryWarningAcknowledged && skipWarning !== true) {
      openDeliveryWarningModal("copy-ticket-url", { ticketPublicId });
      return;
    }
    try {
      const url = `${window.location.origin}/t/${ticketPublicId}`;
      await navigator.clipboard.writeText(url);
      setTicketCopyError({ ticketPublicId: "", message: "" });
      markCopiedTicketPublicId(ticketPublicId);
    } catch {
      setFeedback({ kind: "error", message: "Could not copy ticket URL." });
    }
  };

  const openEvidenceImage = (dataUrl) => {
    const value = String(dataUrl || "").trim();
    if (!value) return;
    setEvidencePreview(value);
  };

  const closeCancelModal = () => {
    setCancelModal({
      open: false,
      ticket: null,
      reason: "",
      evidenceImageDataUrl: "",
      evidenceName: "",
      step: "form",
      loading: false,
      error: "",
    });
  };

  const openCancelTicketModal = (ticket) => {
    if (!isTicketSold(ticket)) return;
    if (isTicketCancelled(ticket)) {
      setTicketCancelError({
        ticketPublicId: String(ticket?.ticketPublicId || ""),
        message: "Ticket already cancelled.",
      });
      return;
    }
    setTicketCancelError({ ticketPublicId: "", message: "" });
    setCancelModal({
      open: true,
      ticket,
      reason: "",
      evidenceImageDataUrl: "",
      evidenceName: "",
      step: "form",
      loading: false,
      error: "",
    });
  };

  const onCancelEvidenceFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCancelModal((prev) => ({
        ...prev,
        evidenceImageDataUrl: dataUrl,
        evidenceName: file.name,
        error: "",
      }));
    } catch (fileError) {
      setCancelModal((prev) => ({ ...prev, error: fileError.message || "Could not load evidence file." }));
    }
    event.target.value = "";
  };

  const submitTicketCancellation = async () => {
    const ticket = cancelModal.ticket;
    if (!ticket?.ticketPublicId || !summary?.event?.id || !accessCode) return;
    setCancelModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      await api.post(`/tickets/${encodeURIComponent(ticket.ticketPublicId)}/cancel`, {
        accessCode,
        eventId: summary.event.id,
        reason: cancelModal.reason,
        evidenceImageDataUrl: cancelModal.evidenceImageDataUrl || undefined,
      });
      await loadTicketsForEvent(summary.event.id);
      await loadRequestsAndPromoters(accessCode, summary.event.id);
      if (chatContext?.id) {
        await loadChatMessages(chatContext.id, { silent: true });
      }
      setTicketCancelError({ ticketPublicId: "", message: "" });
      closeCancelModal();
      setFeedback({ kind: "success", message: `Ticket ${ticket.ticketPublicId} cancelled.` });
    } catch (requestError) {
      setCancelModal((prev) => ({
        ...prev,
        loading: false,
        error: requestError.response?.data?.error || "Could not cancel ticket.",
      }));
      const inlineMessage = requestError.response?.data?.error || "Could not cancel ticket.";
      setTicketCancelError({
        ticketPublicId: String(ticket?.ticketPublicId || ""),
        message: inlineMessage,
      });
    }
  };

  const continueCancelModal = () => {
    const ticket = cancelModal.ticket;
    const requiresEvidence = resolveDeliveryMethodLabel(ticket) === "PUBLIC EVENT PAGE";
    if (!cancelModal.reason) {
      setCancelModal((prev) => ({ ...prev, error: "Select a cancellation reason." }));
      return;
    }
    if (requiresEvidence && !cancelModal.evidenceImageDataUrl) {
      setCancelModal((prev) => ({ ...prev, error: "Evidence is required for public event page cancellations." }));
      return;
    }
    setCancelModal((prev) => ({ ...prev, step: "confirm", error: "" }));
  };

  const approveRequest = async (requestId) => {
    const requestItem = ticketRequests.find((item) => item.id === requestId);
    if (requestItem?.status === "CANCELLED") {
      setFeedback({ kind: "info", message: "request already cancelled" });
      return;
    }
    if (requestItem?.status === "APPROVED") {
      setFeedback({ kind: "info", message: "request already approved" });
      return;
    }
    if (approvingRequestIds.has(requestId)) return;

    setApprovingRequestIds((prev) => {
      const next = new Set(prev);
      next.add(requestId);
      return next;
    });

    try {
      await api.post(`/ticket-requests/${encodeURIComponent(requestId)}/approve`, {
        accessCode,
        eventId: summary?.event?.id,
      });
      await loadRequestsAndPromoters(accessCode, summary?.event?.id);
      await loadTicketsForEvent(summary.event.id);
      setFeedback({ kind: "success", message: "Request approved and ticket Assigned to client." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Approve failed." });
    } finally {
      setApprovingRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const loadChatMessages = async (requestId, { silent = false } = {}) => {
    if (!requestId || !accessCode) return;
    if (!silent) setChatLoading(true);
    try {
      const response = await api.get(`/ticket-requests/${encodeURIComponent(requestId)}/messages`, {
        params: { accessCode, eventId: summary?.event?.id },
      });
      setChatMessages(response.data.messages || []);
      setTicketRequests((prev) =>
        prev.map((item) => (item.id === requestId ? { ...item, unreadClientMessages: 0 } : item)),
      );
    } catch (requestError) {
      if (!silent) {
        setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not load chat." });
      }
    } finally {
      if (!silent) setChatLoading(false);
    }
  };

  const openRequestChat = async (requestItem) => {
    setChatContext(requestItem);
    setChatInput("");
    await loadChatMessages(requestItem.id);
  };

  const closeRequestChat = () => {
    setChatContext(null);
    setChatInput("");
    setChatMessages([]);
  };

  const sendChatMessage = async () => {
    const requestId = chatContext?.id;
    const message = String(chatInput || "").trim();
    if (!requestId || !message || chatSending) return;

    setChatSending(true);
    try {
      await api.post(`/ticket-requests/${encodeURIComponent(requestId)}/messages`, {
        accessCode,
        eventId: summary?.event?.id,
        message,
      });
      setChatInput("");
      await loadChatMessages(requestId, { silent: true });
      await loadRequestsAndPromoters(accessCode, summary?.event?.id);
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not send message." });
    } finally {
      setChatSending(false);
    }
  };

  const addPromoter = async () => {
    if (!promoterForm.name.trim()) {
      setFeedback({ kind: "error", message: "Promoter name is required." });
      return;
    }

    try {
      await api.post("/promoters", {
        accessCode,
        eventId: summary?.event?.id,
        name: promoterForm.name,
      });
      setPromoterForm({ name: "" });
      await loadRequestsAndPromoters(accessCode, summary?.event?.id);
      setFeedback({ kind: "success", message: "Promoter added." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not add promoter." });
    }
  };

  const deletePromoter = async (promoterId) => {
    try {
      await api.delete(`/promoters/${encodeURIComponent(promoterId)}`, {
        data: { accessCode, eventId: summary?.event?.id },
      });
      await loadRequestsAndPromoters(accessCode, summary?.event?.id);
      setFeedback({ kind: "info", message: "Promoter deleted." });
    } catch (requestError) {
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Delete failed." });
    }
  };

  const downloadPdf = async (skipWarning = false) => {
    if (!summary?.event?.id || downloading) return;
    if (deliverableCount < 1) {
      setFeedback({ kind: "error", message: "You downloaded all your tickets. Please generate more tickets." });
      return;
    }
    if (!deliveryWarningAcknowledged && skipWarning !== true) {
      openDeliveryWarningModal("download-pdf");
      return;
    }
    const safeCount = Math.min(Math.max(1, Number.parseInt(String(pdfTicketCount || 1), 10) || 1), deliverableCount);
    setDownloading(true);
    setFeedback({ kind: "", message: "" });
    try {
      const response = await withMinDelay(
        api.get(`/events/${summary.event.id}/tickets.pdf`, {
          responseType: "blob",
          params: { perPage: pdfTicketsPerPage, count: safeCount },
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

      const downloadedCount = Number.parseInt(String(response.headers?.["x-tickets-downloaded"] || safeCount), 10) || safeCount;
      const remainingAfterDownload = Number.parseInt(String(response.headers?.["x-tickets-remaining-deliverable"] || 0), 10) || 0;
      await loadTicketsForEvent(summary.event.id);
      if (remainingAfterDownload < 1) {
        setFeedback({ kind: "info", message: "All tickets downloaded." });
      } else {
        setFeedback({
          kind: "success",
          message: `Downloaded ${downloadedCount} ticket(s). You have ${remainingAfterDownload} tickets left to deliver.`,
        });
      }
    } catch (requestError) {
      setFeedback({
        kind: "error",
        message: requestError.response?.data?.error || requestError.message || "Could not download tickets PDF.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const sendTicketLinks = async (skipWarning = false) => {
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
    if (!deliveryWarningAcknowledged && skipWarning !== true) {
      openDeliveryWarningModal("send-ticket-links");
      return;
    }

    const executeSend = async (allowPartial = false) => {
      setSending(true);
      setFeedback({ kind: "", message: "" });
      setSendSummary(null);
      try {
        const response = await withMinDelay(
          api.post(`/orders/${encodeURIComponent(accessCode)}/send-links`, {
            emails: recipientList,
            eventId: summary?.event?.id,
            ticketType: deliveryTicketType,
            baseUrl: window.location.origin,
            emailSubject,
            emailBody,
            allowPartial,
          }),
        );
        setSendSummary(response.data);
        setRecipientEmails("");
        await loadTicketsForEvent(summary.event.id);
        if (response.data.partialApplied) {
          setFeedback({
            kind: "info",
            message: `Only ${response.data.attemptedEmails} ticket(s) were sent because only ${response.data.availableTicketsBeforeSend} were available.`,
          });
        } else {
          setFeedback({ kind: "success", message: `Email sent for ${deliveryTicketType}.` });
        }
      } catch (requestError) {
        const responseData = requestError.response?.data || {};
        if (
          responseData.code === "INSUFFICIENT_TICKETS" &&
          Number(responseData.availableTickets || 0) > 0 &&
          Number(responseData.availableTickets || 0) < recipientList.length &&
          !allowPartial
        ) {
          const proceed = window.confirm(
            `You have only ${responseData.availableTickets} tickets left. Proceed sending the ${responseData.availableTickets} available ticket(s)?`,
          );
          if (proceed) {
            await executeSend(true);
            return;
          }
          setFeedback({ kind: "info", message: "Email send cancelled." });
          return;
        }
        setFeedback({ kind: "error", message: responseData.error || "Could not send ticket links." });
      } finally {
        setSending(false);
      }
    };

    await executeSend(false);
  };

  const handleTicketsGenerated = async () => {
    if (!summary?.event?.id || !accessCode) return;
    await loadDashboard(accessCode, summary.event.id);
    setActiveMenu("tickets");
    setTicketPage(1);
  };

  const confirmDeliveryWarningModal = async () => {
    const { action, payload } = deliveryWarningModal;
    closeDeliveryWarningModal();
    if (accessCode) {
      localStorage.setItem(getDeliveryWarningAckStorageKey(accessCode), "1");
    }
    setDeliveryWarningAcknowledged(true);

    if (action === "copy-public-event-link") {
      await copyPublicEventLink(true);
      return;
    }
    if (action === "copy-ticket-url") {
      const pendingTicketPublicId = String(payload?.ticketPublicId || "").trim();
      const pendingTicket = tickets.find((ticket) => ticket.ticketPublicId === pendingTicketPublicId);
      if (pendingTicket) {
        await copyTicketUrl(pendingTicket, true);
      } else if (pendingTicketPublicId) {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/t/${pendingTicketPublicId}`);
          setTicketCopyError({ ticketPublicId: "", message: "" });
          markCopiedTicketPublicId(pendingTicketPublicId);
        } catch {
          setFeedback({ kind: "error", message: "Could not copy ticket URL." });
        }
      }
      return;
    }
    if (action === "download-pdf") {
      await downloadPdf(true);
      return;
    }
    if (action === "send-ticket-links") {
      await sendTicketLinks(true);
      return;
    }
    if (action === "copy-promoter-link") {
      await copyPromoterLink(payload?.promoterLink, payload?.promoterId, true);
    }
  };

  const saveEventInline = async () => {
    if (savingEvent) return;
    if (
      !eventDraft.eventName.trim() ||
      !eventDraft.eventDate ||
      !eventDraft.eventAddress.trim()
    ) {
      setFeedback({
        kind: "error",
        message: "Event name, date, and location are required.",
      });
      return;
    }
    setSavingEvent(true);
    try {
      if (eventEditMode === EVENT_EDIT_MODES.CREATE) {
        if (!accessCode) {
          const response = await api.post("/events", {
            organizerName: eventDraft.organizerName,
            eventName: eventDraft.eventName,
            eventDateTime: eventDraft.eventDate,
            eventAddress: eventDraft.eventAddress,
            paymentInstructions: eventDraft.paymentInstructions,
            generateAccessOnly: true,
          });
          const nextOrganizerCode = String(
            response.data?.organizerAccessCode || response.data?.accessCode || "",
          ).trim();
          if (!nextOrganizerCode) {
            throw new Error("Organizer code was not generated.");
          }
          setCode(nextOrganizerCode);
          await loadDashboard(nextOrganizerCode, response.data?.eventId);
          setGeneratedOrganizerCodeModal({
            open: true,
            code: nextOrganizerCode,
            copied: false,
          });
          setFeedback({ kind: "success", message: "Event created and organizer code generated." });
          return;
        }

        const response = await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/create-new`, {
          organizerName: eventDraft.organizerName,
          eventName: eventDraft.eventName,
          eventDate: eventDraft.eventDate,
          eventAddress: eventDraft.eventAddress,
          paymentInstructions: eventDraft.paymentInstructions,
        });
        await loadDashboard(accessCode, response.data?.event?.id);
        setFeedback({ kind: "success", message: "New event created." });
        return;
      }

      if (!summary?.event?.id) {
        setFeedback({ kind: "error", message: "Load an event first." });
        return;
      }
      const response = await api.patch(`/events/${summary.event.id}`, {
        accessCode,
        organizerName: eventDraft.organizerName,
        eventName: eventDraft.eventName,
        eventDate: eventDraft.eventDate,
        eventAddress: eventDraft.eventAddress,
        paymentInstructions: eventDraft.paymentInstructions,
      });
      applySummaryEvent({
        ...(summary || {}),
        event: { ...summary?.event, ...response.data.event },
        events: events.map((eventItem) =>
          eventItem.id === response.data?.event?.id
            ? {
                ...eventItem,
                organizerName: response.data?.event?.organizerName,
                eventName: response.data?.event?.eventName,
                eventDate: response.data?.event?.eventDate,
                eventAddress: response.data?.event?.eventAddress,
              }
            : eventItem,
        ),
      });
      setFeedback({ kind: "success", message: "Event details updated." });
    } catch (requestError) {
      if (handleTicketLockError(requestError)) return;
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not update event." });
    } finally {
      setSavingEvent(false);
    }
  };

  const switchToCreateEventMode = () => {
    setEventEditMode(EVENT_EDIT_MODES.CREATE);
    setEventDraft({
      organizerName: "",
      eventName: "",
      eventDate: "",
      eventAddress: "",
      paymentInstructions: "",
    });
    setShowPublicPreview(false);
  };

  const switchToEditEventMode = () => {
    if (!summary?.event) return;
    setEventEditMode(EVENT_EDIT_MODES.EDIT);
    setEventDraft({
      organizerName: String(summary.event.organizerName || ""),
      eventName: String(summary.event.eventName || ""),
      eventDate: toLocalDateTimeInputValue(summary.event.eventDate),
      eventAddress: String(summary.event.eventAddress || ""),
      paymentInstructions: String(summary.event.paymentInstructions || ""),
    });
  };

  const closeOrganizerCodeModal = () => {
    setGeneratedOrganizerCodeModal((prev) => ({ ...prev, open: false, copied: false }));
  };

  const copyOrganizerCode = async () => {
    const value = String(generatedOrganizerCodeModal.code || "").trim();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setGeneratedOrganizerCodeModal((prev) => ({ ...prev, copied: true }));
  };

  const selectExistingEvent = async (eventId) => {
    if (!eventId || !accessCode || eventId === selectedEventId) return;
    const storageKey = getSelectedEventStorageKey(accessCode);
    localStorage.setItem(storageKey, eventId);
    await loadDashboard(accessCode, eventId);
  };

  const applyTicketEditorDraft = (draft) => {
    if (!draft) return;
    // Keep latest draft without mutating parent event state; mutating summary here
    // causes TicketEditor props to change and resets local editor fields on each keystroke.
    ticketEditorDraftRef.current = draft;
  };

  const saveTicketEditorDraft = async (draft) => {
    if (!summary?.event?.id || !accessCode || savingTicketDraft) return;
    setSavingTicketDraft(true);
    try {
      const payload = {
        accessCode,
        eventId: summary.event.id,
        organizerName: draft?.organizerName ?? summary.event.organizerName ?? "",
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
        organizerName: String(response.data?.event?.organizerName || ""),
        eventName: String(response.data?.event?.eventName || ""),
        eventDate: toLocalDateTimeInputValue(response.data?.event?.eventDate),
        eventAddress: String(response.data?.event?.eventAddress || ""),
        paymentInstructions: String(response.data?.event?.paymentInstructions || ""),
      });
      setFeedback({ kind: "success", message: "Ticket editor changes saved." });
    } catch (requestError) {
      if (handleTicketLockError(requestError)) return;
      setFeedback({ kind: "error", message: requestError.response?.data?.error || "Could not save ticket changes." });
    } finally {
      setSavingTicketDraft(false);
    }
  };

  const openDeliveryWarningModal = (action, payload = null) => {
    setDeliveryWarningModal({
      open: true,
      action,
      payload,
    });
  };

  const closeDeliveryWarningModal = () => {
    setDeliveryWarningModal({
      open: false,
      action: "",
      payload: null,
    });
  };

  const copyPromoterLink = async (promoterLink, promoterId = "", skipWarning = false) => {
    if (!promoterLink) return;
    if (!deliveryWarningAcknowledged && skipWarning !== true) {
      openDeliveryWarningModal("copy-promoter-link", { promoterLink, promoterId });
      return;
    }
    try {
      await navigator.clipboard.writeText(promoterLink);
      markCopiedPromoterId(promoterId);
    } catch {
      setFeedback({ kind: "error", message: "Could not copy promoter link." });
    }
  };

  const copyPublicEventLink = async (skipWarning = false) => {
    if (!summary?.event?.slug) return;
    if (noDeliverableTickets) {
      setFeedback({
        kind: "error",
        message:
          pendingRequestedCount > 0
            ? "You have no free tickets to deliver right now because pending public requests reserved them."
            : "You have no more tickets to deliver and downloaded all tickets. Generate more before sharing public link.",
      });
      return;
    }
    if (!deliveryWarningAcknowledged && skipWarning !== true) {
      openDeliveryWarningModal("copy-public-event-link");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/e/${summary.event.slug}`);
      markCopiedPublicEventLink();
    } catch {
      setFeedback({ kind: "error", message: "Could not copy public event link." });
    }
  };

  const handleGetStarted = () => {
    if (organizerNameRef.current) {
      organizerNameRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      organizerNameRef.current.focus();
    }
  };

  const handleAlreadyHaveCode = () => {
    navigate("/dashboard");
  };

  const handleBackToHome = () => {
    navigate("/");
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      {showHeroSection ? (
        <section className="mt-4 rounded border p-4">
          <h1 className="text-3xl font-black leading-tight sm:text-4xl">Stop Signing Up For Ticket Platforms</h1>
          <p className="mt-4 text-base font-semibold text-slate-800 sm:text-lg">Create your event &rarr; Generate QR tickets &rarr; Scan at the door</p>
          <div className="mt-4 space-y-1 text-sm font-semibold text-slate-900 sm:text-base">
            <p>&#10004; No accounts.</p>
            <p>&#10004; No passwords.</p>
            <p>&#10004; No payment details.</p>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <AppButton
              type="button"
              variant="primary"
              className="sm:w-auto"
              onClick={handleGetStarted}
            >
              Get started
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              className="sm:w-auto"
              onClick={handleAlreadyHaveCode}
            >
              Already have Organizer access code?
            </AppButton>
          </div>
        </section>
      ) : showLoadDashboard ? (
        <div className="mt-8 max-w-sm">
          <h2 className="text-xl font-bold">Load your dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your organizer access code to continue.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="w-full rounded border p-2"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter your organizer access code"
              autoFocus
            />
            <AppButton onClick={load} loading={loading} loadingText="Loading..." variant="primary">Load</AppButton>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="text-sm text-slate-500 underline hover:text-slate-800"
              onClick={handleBackToHome}
            >
              Back to home
            </button>
            <Link to="/help?recovery=1" className="text-sm text-red-600 underline hover:text-red-800">
              Lost your access code?
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
            <span className="rounded border bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Organizer Code: <span className="font-mono">{accessCode || "-"}</span>
            </span>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input className="w-full rounded border p-2" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter your organizer access code" />
            <AppButton onClick={load} loading={loading} loadingText="Loading..." variant="primary">Load</AppButton>
          </div>
        </>
      )}

      <div ref={feedbackRef}>
        <FeedbackBanner className="mt-3" kind={feedback.kind} message={feedback.message} />
      </div>

      {(!showLoadDashboard || summary) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
          {visibleMenus.map((menu) => (
            <button
              key={menu.id}
              type="button"
              onClick={() => setActiveMenu(menu.id)}
              className={`relative rounded border px-3 py-1.5 ${activeMenu === menu.id ? "bg-slate-900 text-white" : "bg-white text-slate-800"}`}
            >
              {menu.label}
              {menu.id === "chat" && chatUnreadTotal > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                  {chatUnreadTotal > 99 ? "99+" : chatUnreadTotal}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {shouldOpenHomeMode && !summary ? (
        <p className="mt-2 text-xs text-blue-700">
          Fill in your event details. You can update them anytime.
        </p>
      ) : null}

      {summary ? (
        <>
          {activeMenu === "events" ? (
            <>
              <section className="mt-4 rounded border p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_1fr] sm:items-center">
                  <p className="font-semibold">Event:</p>
                  <select
                    className="w-full rounded border p-2 text-sm"
                    value={selectedEventId}
                    onChange={(e) => selectExistingEvent(e.target.value)}
                    disabled={!events.length || loading || savingEvent}
                  >
                    {events.map((eventItem) => (
                      <option key={eventItem.id} value={eventItem.id}>
                        {eventItem.eventName} ({formatDate(eventItem.eventDate)})
                      </option>
                    ))}
                  </select>
                  <p className="font-semibold">Organizer:</p>
                  <input
                    className="w-full rounded border p-2 text-sm"
                    value={eventDraft.organizerName}
                    onChange={(e) => setEventDraft((prev) => ({ ...prev, organizerName: e.target.value }))}
                    placeholder="Organizer or brand name"
                  />
                  <p className="font-semibold">Event Name:</p>
                  <input
                    className="w-full rounded border p-2 text-sm"
                    value={eventDraft.eventName}
                    onChange={(e) => setEventDraft((prev) => ({ ...prev, eventName: e.target.value }))}
                  />
                  <p className="font-semibold">Date:</p>
                  <DateTimeInput
                    value={eventDraft.eventDate}
                    onChange={(v) => setEventDraft((prev) => ({ ...prev, eventDate: v }))}
                  />
                  <p className="font-semibold">Location:</p>
                  <input
                    className="w-full rounded border p-2 text-sm"
                    value={eventDraft.eventAddress}
                    onChange={(e) => setEventDraft((prev) => ({ ...prev, eventAddress: e.target.value }))}
                  />
                  <p className="font-semibold">Payment:</p>
                  <div>
                    <textarea
                      className="w-full rounded border p-2 text-sm"
                      rows={3}
                      placeholder="How should clients pay? (e.g. CashApp $..., Zelle ..., bank transfer...)"
                      value={eventDraft.paymentInstructions}
                      onChange={(e) => setEventDraft((prev) => ({ ...prev, paymentInstructions: e.target.value }))}
                    />
                    <p className="mt-1 text-xs text-slate-500">Leave this blank for free events.</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AppButton className="" onClick={saveEventInline} loading={savingEvent} loadingText={eventPrimaryLoadingLabel}>
                    {eventPrimaryActionLabel}
                  </AppButton>
                  <AppButton type="button" variant="secondary" onClick={switchToCreateEventMode}>
                    Add New Event
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="secondary"
                    className={eventEditMode === EVENT_EDIT_MODES.EDIT ? "text-blue-700" : ""}
                    onClick={switchToEditEventMode}
                    disabled={!summary?.event?.id}
                  >
                    Edit Event
                  </AppButton>
                </div>
                {eventEditMode === EVENT_EDIT_MODES.CREATE ? (
                  <p className="mt-2 text-xs text-blue-700">
                    {isAccessCodeGenerationMode
                      ? "Generate your access code to start editing and sending QR tickets to your clients."
                      : "You are creating a new event. Save Event will create a fresh event under this dashboard access code."}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-blue-700">
                    Editing event: {String(summary?.event?.eventName || "Selected event")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="break-all"><span className="font-semibold">Public Event Link:</span> {summary.event.slug ? `${window.location.origin}/e/${summary.event.slug}` : "Not available"}</p>
                  {summary.event.slug ? (
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                      disabled={noDeliverableTickets}
                      onClick={() => {
                        void copyPublicEventLink();
                      }}
                    >
                      {copiedPublicEventLink ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>
                {noDeliverableTickets ? (
                  <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    {pendingRequestedCount > 0
                      ? "You have no free tickets to deliver right now because pending public requests reserved them."
                      : "You have no more tickets to deliver and downloaded all tickets. Please generate more before sharing this link."}
                  </p>
                ) : null}
                {summary.event.slug ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="inline-flex rounded border bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setShowPublicPreview((prev) => !prev)}
                    >
                      {showPublicPreview ? "Hide" : "Preview Public Event Page"}
                    </button>
                  </div>
                ) : null}
              </section>
              {summary.event.slug && showPublicPreview ? (
                <PublicEventExperience eventSlug={summary.event.slug} previewMode />
              ) : null}
            </>
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
                  initialDesignJson={summary.event.designJson || null}
                  initialOrganizerName={summary.event.organizerName || ""}
                  canDeleteTicketTypes={tickets.length < 1}
                  onGenerated={handleTicketsGenerated}
                  onDraftChange={applyTicketEditorDraft}
                  onSave={saveTicketEditorDraft}
                  saveLoading={savingTicketDraft}
                />
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  className={`rounded border p-2 text-center ${ticketStatusFilter === TICKET_STATUS_FILTERS.TOTAL ? "border-slate-900 bg-slate-100" : "bg-white"}`}
                  onClick={() => setTicketStatusFilter(TICKET_STATUS_FILTERS.TOTAL)}
                >
                  <p className="text-[10px] uppercase text-slate-500">Total</p>
                  <p className="text-lg font-bold leading-none">{tickets.length}</p>
                </button>
                <button
                  type="button"
                  className={`rounded border p-2 text-center ${ticketStatusFilter === TICKET_STATUS_FILTERS.SOLD ? "border-slate-900 bg-slate-100" : "bg-white"}`}
                  onClick={() => setTicketStatusFilter(TICKET_STATUS_FILTERS.SOLD)}
                >
                  <p className="text-[10px] uppercase text-slate-500">Sold</p>
                  <p className="text-lg font-bold leading-none">{soldTicketsCount}</p>
                </button>
                <button
                  type="button"
                  className={`rounded border p-2 text-center ${ticketStatusFilter === TICKET_STATUS_FILTERS.SCANNED ? "border-slate-900 bg-slate-100" : "bg-white"}`}
                  onClick={() => setTicketStatusFilter(TICKET_STATUS_FILTERS.SCANNED)}
                >
                  <p className="text-[10px] uppercase text-slate-500">Scanned</p>
                  <p className="text-lg font-bold leading-none">{scannedTicketsCount}</p>
                </button>
                <button
                  type="button"
                  className={`rounded border p-2 text-center ${ticketStatusFilter === TICKET_STATUS_FILTERS.REMAINING ? "border-slate-900 bg-slate-100" : "bg-white"}`}
                  onClick={() => setTicketStatusFilter(TICKET_STATUS_FILTERS.REMAINING)}
                >
                  <p className="text-[10px] uppercase text-slate-500">Remaining</p>
                  <p className="text-lg font-bold leading-none">{remainingTicketsCount}</p>
                </button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold">Generated tickets</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">Type</label>
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
                  <label className="text-xs font-medium text-slate-600">Buyer</label>
                  <input
                    className="rounded border p-1.5 text-xs"
                    value={buyerSearch}
                    onChange={(event) => setBuyerSearch(event.target.value)}
                    placeholder="Search buyer name/email"
                  />
                </div>
              </div>
              <div className="mt-3 space-y-3 lg:hidden">
                {pagedTickets.map((ticket) => (
                  <article key={ticket.ticketPublicId} className="rounded border bg-white p-3 text-sm">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <p><span className="font-semibold">Ticket ID:</span> <span className="break-all font-mono">{ticket.ticketPublicId}</span></p>
                      <p><span className="font-semibold">Status:</span> {ticket.status}</p>
                      <p><span className="font-semibold">Type:</span> {ticket.ticketType || summary.event.ticketType || "General"}</p>
                      <p><span className="font-semibold">Sold:</span> {isTicketSold(ticket) ? "YES" : "NO"}</p>
                      <p className="col-span-2"><span className="font-semibold">Buyer:</span> <span className="break-all">{ticket.buyer || "-"}</span></p>
                      <p><span className="font-semibold">Delivery:</span> {resolveDeliveryMethodLabel(ticket)}</p>
                      <p><span className="font-semibold">Scanned At:</span> {formatDate(ticket.scannedAt)}</p>
                      <p className="col-span-2">
                        <span className="font-semibold">Cancellation Reason:</span>{" "}
                        {isTicketCancelled(ticket)
                          ? resolveCancellationReasonLabel(ticket.cancellationReason, ticket.cancellationOtherReason)
                          : "-"}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AppButton
                        type="button"
                        className={`px-2 py-1 text-xs ${!isTicketSold(ticket) || isTicketCancelled(ticket) ? "opacity-70" : ""}`}
                        variant={!isTicketSold(ticket) || isTicketCancelled(ticket) ? "secondary" : "danger"}
                        onClick={() => openCancelTicketModal(ticket)}
                        disabled={!isTicketSold(ticket)}
                      >
                        {!isTicketSold(ticket)
                          ? "Not Sold"
                          : isTicketCancelled(ticket)
                            ? `Cancelled at ${formatDate(ticket.cancelledAt || ticket.invalidatedAt)}`
                            : "Cancel Ticket"}
                      </AppButton>
                      <AppButton
                        type="button"
                        className={`px-2 py-1 text-xs ${resolveDeliveryMethodLabel(ticket) !== "NOT_DELIVERED" ? "opacity-70" : ""}`}
                        variant="secondary"
                        title={resolveDeliveryMethodLabel(ticket) !== "NOT_DELIVERED" ? `cant copy! ticket already delivered through ${resolveDeliveryMethodErrorLabel(resolveDeliveryMethodLabel(ticket))}.` : "Copy ticket URL"}
                        onClick={() => copyTicketUrl(ticket)}
                      >
                        {copiedTicketPublicId === ticket.ticketPublicId ? "Copied" : "Copy"}
                      </AppButton>
                    </div>
                    {ticketCancelError.ticketPublicId === ticket.ticketPublicId && ticketCancelError.message ? (
                      <p className="mt-1 text-xs text-red-600">{ticketCancelError.message}</p>
                    ) : null}
                    {ticketCopyError.ticketPublicId === ticket.ticketPublicId && ticketCopyError.message ? (
                      <p className="mt-1 text-xs text-red-600">{ticketCopyError.message}</p>
                    ) : null}
                  </article>
                ))}
                {!pagedTickets.length ? <p className="text-sm text-slate-500">No tickets for selected filters.</p> : null}
              </div>
              <div className="mt-3 hidden overflow-x-auto rounded border lg:block">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-slate-100"><tr><th className="p-2">Ticket ID</th><th className="p-2">Ticket Type</th><th className="p-2">Buyer</th><th className="p-2">Sold</th><th className="p-2">Status</th><th className="p-2">Delivery Method</th><th className="p-2">Scanned At</th><th className="p-2">Cancellations</th><th className="p-2">Copy</th></tr></thead>
                  <tbody>
                    {pagedTickets.map((ticket) => (
                      <tr key={ticket.ticketPublicId} className="border-t">
                        <td className="break-all p-2 font-mono">{ticket.ticketPublicId}</td>
                        <td className="p-2">{ticket.ticketType || summary.event.ticketType || "General"}</td>
                        <td className="p-2">{ticket.buyer || "-"}</td>
                        <td className="p-2">{isTicketSold(ticket) ? "YES" : "NO"}</td>
                        <td className="p-2">{ticket.status}</td>
                        <td className="p-2">{resolveDeliveryMethodLabel(ticket)}</td>
                        <td className="p-2">{formatDate(ticket.scannedAt)}</td>
                        <td className="p-2">
                          {isTicketSold(ticket) ? (
                            <>
                              <button
                                type="button"
                                className={`rounded border px-2 py-1 text-xs ${isTicketCancelled(ticket) ? "opacity-60" : ""}`}
                                onClick={() => openCancelTicketModal(ticket)}
                              >
                                {isTicketCancelled(ticket) ? `Cancelled at ${formatDate(ticket.cancelledAt || ticket.invalidatedAt)}` : "Cancel Ticket"}
                              </button>
                              {isTicketCancelled(ticket) ? (
                                <p className="mt-1 text-xs text-slate-600">
                                  {resolveCancellationReasonLabel(ticket.cancellationReason, ticket.cancellationOtherReason)}
                                </p>
                              ) : null}
                              {ticketCancelError.ticketPublicId === ticket.ticketPublicId && ticketCancelError.message ? (
                                <p className="mt-1 text-xs text-red-600">{ticketCancelError.message}</p>
                              ) : null}
                            </>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-2">
                          <button
                            className={`rounded border px-2 py-1 text-xs ${resolveDeliveryMethodLabel(ticket) !== "NOT_DELIVERED" ? "opacity-60" : ""}`}
                            title={resolveDeliveryMethodLabel(ticket) !== "NOT_DELIVERED" ? `cant copy! ticket already delivered through ${resolveDeliveryMethodErrorLabel(resolveDeliveryMethodLabel(ticket))}.` : "Copy ticket URL"}
                            onClick={() => copyTicketUrl(ticket)}
                          >
                            {copiedTicketPublicId === ticket.ticketPublicId ? "Copied" : "Copy"}
                          </button>
                          {ticketCopyError.ticketPublicId === ticket.ticketPublicId && ticketCopyError.message ? (
                            <p className="mt-1 text-xs text-red-600">{ticketCopyError.message}</p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!pagedTickets.length ? (
                      <tr className="border-t">
                        <td className="p-3 text-slate-500" colSpan={9}>No tickets for selected filters.</td>
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
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="radio" name="deliveryMethod" value={DELIVERY_METHODS.PUBLIC_EVENT_LINK} checked={deliveryMethod === DELIVERY_METHODS.PUBLIC_EVENT_LINK} onChange={(event) => setDeliveryMethod(event.target.value)} />
                <span>Public event link</span>
              </label>

              {deliveryMethod === DELIVERY_METHODS.PDF ? (
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-medium">Number of tickets to download</label>
                  <input
                    className="w-full rounded border p-2 text-sm sm:w-44"
                    type="number"
                    min={1}
                    max={Math.max(1, deliverableCount)}
                    value={pdfTicketCount}
                    onChange={(event) => setPdfTicketCount(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                    disabled={downloading || deliverableCount < 1}
                  />
                  <p className="mt-1 text-xs text-slate-600">
                    Deliverable tickets left: {deliverableCount}. Already downloaded via PDF: {pdfDeliveredCount}.
                  </p>
                  {pendingRequestedCount > 0 ? (
                    <p className="mt-1 text-xs text-amber-700">
                      You have {pendingRequestedCount} ticket(s) requested via public page. You can only download {deliverableCount} ticket(s).
                    </p>
                  ) : null}
                  <label className="mb-1 block text-sm font-medium">Tickets per page</label>
                  <select className="w-full rounded border p-2 text-sm sm:w-44" value={pdfTicketsPerPage} onChange={(event) => setPdfTicketsPerPage(Number.parseInt(event.target.value, 10) || 2)} disabled={downloading}>
                    {PDF_TICKETS_PER_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <AppButton className="mt-3" variant="secondary" onClick={() => void downloadPdf()} loading={downloading} loadingText="Downloading...">Download Tickets PDF</AppButton>
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
                  <p className="mt-1 text-xs text-slate-600">Undelivered tickets currently available: {deliverableCount}</p>

                  <div className="mt-4 rounded border bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Email content sample - its only a sample ! the actual ticket links and ticket type is different for each recipient (we send one ticket per email)</p>
                      <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setShowEmailPreview((prev) => !prev)}>
                        {showEmailPreview ? "Hide preview" : "View preview"}
                      </AppButton>
                    </div>
                    {showEmailPreview ? (
                      <div className="mt-3 rounded border bg-white p-3 text-sm">
                        <p className="text-xs text-slate-500">To: {sampleRecipient}</p>
                        <p className="mt-2"><span className="font-semibold">Subject:</span> {previewSubject}</p>
                        <div className="mt-2 overflow-hidden rounded bg-slate-50 p-2 text-sm text-slate-700 [&_a]:break-all [&_table]:max-w-full [&_table]:w-full [&_td]:break-words" dangerouslySetInnerHTML={{ __html: previewBodyHtml }} />
                      </div>
                    ) : null}
                  </div>

                  <AppButton className="mt-3" variant="indigo" onClick={() => void sendTicketLinks()} loading={sending} loadingText="Sending...">Send tickets</AppButton>
                </div>
              ) : null}

              {deliveryMethod === DELIVERY_METHODS.PUBLIC_EVENT_LINK ? (
                <div className="mt-3">
                  <p className="text-sm text-slate-700">
                    Share your public event link so guests can request tickets directly.
                  </p>
                  <p className="mt-2 break-all rounded border bg-slate-50 p-2 text-xs text-slate-700">
                    {summary?.event?.slug ? `${window.location.origin}/e/${summary.event.slug}` : "Public event link is not available yet."}
                  </p>
                  <AppButton
                    className="mt-3"
                    variant="secondary"
                    onClick={() => void copyPublicEventLink()}
                    disabled={!summary?.event?.slug || noDeliverableTickets}
                  >
                    {copiedPublicEventLink ? "Copied" : "Copy Public Event Link"}
                  </AppButton>
                  {noDeliverableTickets ? (
                    <p className="mt-2 text-xs text-amber-700">
                      {pendingRequestedCount > 0
                        ? "You have no free tickets to deliver right now because pending public requests reserved them."
                        : "You have no more tickets to deliver and downloaded all tickets. Generate more before sharing this link."}
                    </p>
                  ) : null}
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
              <div className="mt-3 space-y-3 lg:hidden">
                {ticketRequests.map((item) => {
                  const selections = Array.isArray(item.ticketSelections) ? item.ticketSelections : [];
                  const isApproved = item.status === "APPROVED";
                  const isCancelled = item.status === "CANCELLED";
                  const isApproving = approvingRequestIds.has(item.id);
                  return (
                    <article key={item.id} className="rounded border bg-white p-3 text-sm">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <p><span className="font-semibold">Name:</span> {item.name}</p>
                        <p><span className="font-semibold">Email:</span> {item.email || "-"}</p>
                        <p className="col-span-2">
                          <span className="font-semibold">Ticket Types:</span>{" "}
                          {selections.length
                            ? selections.map((selection) => `${selection.ticketType} x${selection.quantity}`).join(", ")
                            : item.ticketType || "-"}
                        </p>
                        <p><span className="font-semibold">Quantity:</span> {item.quantity}</p>
                        <p><span className="font-semibold">Delivery:</span> {item.deliveryStatus || "PENDING"}</p>
                        <p className="col-span-2"><span className="font-semibold">Status:</span> {item.status}</p>
                        <p className="col-span-2">
                          <span className="font-semibold">Evidence:</span>{" "}
                          {item.evidenceImageDataUrl ? (
                            <button className="text-blue-700 underline" onClick={() => openEvidenceImage(item.evidenceImageDataUrl)}>View</button>
                          ) : (
                            "-"
                          )}
                        </p>
                        {item.organizerMessage ? <p className="col-span-2 text-slate-600"><span className="font-semibold">Message:</span> {item.organizerMessage}</p> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <AppButton
                          className={`px-2 py-1 text-xs ${isApproved || isCancelled ? "opacity-70" : ""}`}
                          variant={isApproved || isCancelled ? "secondary" : "success"}
                          onClick={() => approveRequest(item.id)}
                          loading={isApproving}
                          loadingText="Approving..."
                        >
                          {isCancelled ? "Cancelled" : isApproved ? "Approved" : "Approve"}
                        </AppButton>
                        <AppButton className="px-2 py-1 text-xs" variant="secondary" onClick={() => setActiveMenu("chat")}>
                          Open chat inbox
                        </AppButton>
                      </div>
                    </article>
                  );
                })}
                {!ticketRequests.length ? <p className="text-sm text-slate-500">No ticket requests yet.</p> : null}
              </div>
              <div className="mt-3 hidden overflow-x-auto rounded border lg:block">
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
                      const isApproved = item.status === "APPROVED";
                      const isCancelled = item.status === "CANCELLED";
                      const isApproving = approvingRequestIds.has(item.id);
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
                              <button className="inline-block" onClick={() => openEvidenceImage(item.evidenceImageDataUrl)}>
                                <img src={item.evidenceImageDataUrl} alt="Payment evidence" className="h-12 w-12 rounded border object-cover" />
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs break-all">{Array.isArray(item.ticketIds) && item.ticketIds.length ? item.ticketIds.join(", ") : "-"}</td>
                          <td className="p-2">
                            <p>{item.status}</p>
                            {item.organizerMessage ? <p className="mt-1 text-xs text-slate-600">{item.organizerMessage}</p> : null}
                          </td>
                          <td className="p-2">{item.deliveryStatus || "PENDING"}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-2">
                              <AppButton
                                className={`px-2 py-1 text-xs ${isApproved || isCancelled ? "opacity-70" : ""}`}
                                variant={isApproved || isCancelled ? "secondary" : "success"}
                                onClick={() => approveRequest(item.id)}
                                loading={isApproving}
                                loadingText="Approving..."
                              >
                                {isCancelled ? "Cancelled" : isApproved ? "Approved" : "Approve"}
                              </AppButton>
                              <AppButton className="px-2 py-1 text-xs" variant="secondary" onClick={() => setActiveMenu("chat")}>
                                Open chat inbox
                              </AppButton>
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
              </div>
              <AppButton className="mt-3" onClick={addPromoter}>Add Promoter</AppButton>
              <p className="mt-2 text-xs text-slate-600">
                Add a promoter name to generate a tracking link and measure how many guests each promoter brings.
              </p>

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
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void copyPromoterLink(promoter.link, promoter.id)}>{copiedPromoterId === promoter.id ? "Copied" : "Copy Link"}</button>
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

          {activeMenu === "chat" ? (
            <section className="mt-4">
              {organizerChatAccessCode ? (
                <ChatInboxLayout
                  title="Organizer Chat"
                  actorType="ORGANIZER"
                  api={organizerChatApiClient}
                  quickStarts={organizerChatQuickStarts}
                  listParams={organizerChatListParams}
                  socketCredentials={{ accessCode: organizerChatAccessCode }}
                  onUnreadCountChange={setChatUnreadTotal}
                />
              ) : (
                <section className="rounded border bg-white p-4 text-sm text-slate-600">
                  Enter your organizer access code to open chat.
                </section>
              )}
            </section>
          ) : null}

          {cancelModal.open ? (
            <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
              <section className="w-full max-w-lg rounded border bg-white p-4 shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Cancel Ticket</p>
                    <p className="text-xs text-slate-500">{cancelModal.ticket?.ticketPublicId || "-"}</p>
                  </div>
                  <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={closeCancelModal} disabled={cancelModal.loading}>
                    Close
                  </AppButton>
                </div>

                {cancelModal.step === "form" ? (
                  <>
                    <div className="mt-3 space-y-3 text-sm">
                      <div>
                        <p className="font-medium">Reason for cancellation</p>
                        <div className="mt-2 space-y-2">
                          {CANCELLATION_REASON_OPTIONS.map((option) => (
                            <label key={option.value} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="ticket-cancel-reason"
                                value={option.value}
                                checked={cancelModal.reason === option.value}
                                onChange={(event) => setCancelModal((prev) => ({ ...prev, reason: event.target.value, error: "" }))}
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {resolveDeliveryMethodLabel(cancelModal.ticket) === "PUBLIC EVENT PAGE" ? (
                        <div>
                          <p className="font-medium">Cancellation evidence</p>
                          <input className="mt-2 w-full rounded border p-2 text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCancelEvidenceFileChange} />
                          {cancelModal.evidenceName ? <p className="mt-1 text-xs text-slate-600">{cancelModal.evidenceName}</p> : null}
                          {cancelModal.evidenceImageDataUrl ? (
                            <button type="button" className="mt-2 inline-block" onClick={() => openEvidenceImage(cancelModal.evidenceImageDataUrl)}>
                              <img src={cancelModal.evidenceImageDataUrl} alt="Cancellation evidence preview" className="h-16 w-16 rounded border object-cover" />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {cancelModal.error ? <p className="mt-3 text-sm text-red-600">{cancelModal.error}</p> : null}
                    <div className="mt-4 flex justify-end gap-2">
                      <AppButton type="button" variant="secondary" onClick={closeCancelModal} disabled={cancelModal.loading}>
                        Go Back
                      </AppButton>
                      <AppButton type="button" variant="danger" onClick={continueCancelModal} disabled={cancelModal.loading}>
                        Cancel Ticket
                      </AppButton>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm text-amber-900">
                      This action cannot be undone. Proceed with cancelling this ticket?
                    </p>
                    {cancelModal.error ? <p className="mt-3 text-sm text-red-600">{cancelModal.error}</p> : null}
                    <div className="mt-4 flex justify-end gap-2">
                      <AppButton type="button" variant="secondary" onClick={() => setCancelModal((prev) => ({ ...prev, step: "form", error: "" }))} disabled={cancelModal.loading}>
                        Go Back
                      </AppButton>
                      <AppButton type="button" variant="danger" onClick={submitTicketCancellation} loading={cancelModal.loading} loadingText="Cancelling...">
                        Proceed
                      </AppButton>
                    </div>
                  </>
                )}
              </section>
            </div>
          ) : null}

          {chatContext ? (
            <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
              <section className="w-full max-w-xl rounded border bg-white p-3 shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Chat with {chatContext.name || "Buyer"}</p>
                    <p className="text-xs text-slate-500">{chatContext.email || "No email"}{chatContext.phone ? ` | ${chatContext.phone}` : ""}</p>
                  </div>
                  <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={closeRequestChat}>
                    Close
                  </AppButton>
                </div>

                <div className="mt-3 h-72 overflow-y-auto rounded border bg-slate-50 p-2">
                  {chatLoading ? (
                    <p className="text-xs text-slate-500">Loading chat...</p>
                  ) : chatMessages.length ? (
                    <div className="space-y-2">
                      {chatMessages.map((message) => {
                        const isOrganizer = message.senderType === "ORGANIZER";
                        return (
                          <div key={message.id} className={`flex ${isOrganizer ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded px-2 py-1 text-xs ${isOrganizer ? "bg-indigo-600 text-white" : "bg-white text-slate-900 border"}`}>
                              <p>{message.message}</p>
                              {message.evidenceImageDataUrl ? (
                                <button type="button" className="mt-2 block" onClick={() => openEvidenceImage(message.evidenceImageDataUrl)}>
                                  <img src={message.evidenceImageDataUrl} alt="Chat evidence" className="h-20 w-20 rounded border object-cover" />
                                </button>
                              ) : null}
                              <p className={`mt-1 text-[10px] ${isOrganizer ? "text-indigo-100" : "text-slate-500"}`}>
                                {formatDate(message.createdAt)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No messages yet.</p>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <textarea
                    className="w-full rounded border p-2 text-sm"
                    rows={3}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Type a message to buyer..."
                  />
                  <AppButton
                    type="button"
                    className="self-end"
                    variant="indigo"
                    onClick={sendChatMessage}
                    loading={chatSending}
                    loadingText="Sending..."
                  >
                    Send
                  </AppButton>
                </div>
              </section>
            </div>
          ) : null}

          {deliveryWarningModal.open ? (
            <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
              <section className="w-full max-w-lg rounded border bg-white p-4 shadow-xl">
                <p className="text-sm font-semibold">Before You Continue</p>
                <p className="mt-2 text-sm text-slate-700">
                  Once you deliver a ticket, you cannot change organizer, event, or ticket details. Make sure everything is final.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <AppButton type="button" variant="secondary" onClick={closeDeliveryWarningModal}>
                    Go Back
                  </AppButton>
                  <AppButton type="button" variant="primary" onClick={() => void confirmDeliveryWarningModal()}>
                    Understood
                  </AppButton>
                </div>
              </section>
            </div>
          ) : null}

          {evidencePreview ? (
            <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center">
              <section className="w-full max-w-4xl rounded border bg-slate-900 p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">Payment Evidence</p>
                  <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setEvidencePreview("")}>
                    Close
                  </AppButton>
                </div>
                <div className="flex max-h-[78vh] items-center justify-center overflow-auto rounded bg-black p-2">
                  <img src={evidencePreview} alt="Payment evidence" className="max-h-[74vh] w-auto rounded bg-white" />
                </div>
              </section>
            </div>
          ) : null}
        </>
      ) : shouldOpenHomeMode ? (
        <section className="mt-4 rounded border p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_1fr] sm:items-center">
            <p className="font-semibold">Organizer:</p>
            <div>
              <input
                ref={organizerNameRef}
                className="w-full rounded border p-2 text-sm"
                value={eventDraft.organizerName}
                onChange={(e) => setEventDraft((prev) => ({ ...prev, organizerName: e.target.value }))}
                placeholder="Organizer or brand name"
              />
              {isAccessCodeGenerationMode ? (
                <p className="mt-1 text-xs text-indigo-600">Start here — enter your name or brand to generate your organizer access code.</p>
              ) : null}
            </div>
            <p className="font-semibold">Event Name:</p>
            <input
              className="w-full rounded border p-2 text-sm"
              value={eventDraft.eventName}
              onChange={(e) => setEventDraft((prev) => ({ ...prev, eventName: e.target.value }))}
            />
            <p className="font-semibold">Date:</p>
            <DateTimeInput
              value={eventDraft.eventDate}
              onChange={(v) => setEventDraft((prev) => ({ ...prev, eventDate: v }))}
            />
            <p className="font-semibold">Location:</p>
            <input
              className="w-full rounded border p-2 text-sm"
              value={eventDraft.eventAddress}
              onChange={(e) => setEventDraft((prev) => ({ ...prev, eventAddress: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <AppButton className="" onClick={saveEventInline} loading={savingEvent} loadingText={eventPrimaryLoadingLabel}>
              {eventPrimaryActionLabel}
            </AppButton>
          </div>
          {isAccessCodeGenerationMode ? (
            <p className="mt-2 text-xs text-blue-700">
              Generate your access code to start editing and sending QR tickets to your clients.
            </p>
          ) : null}
        </section>
      ) : null}

      {generatedOrganizerCodeModal.open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <section className="w-full max-w-xl rounded border bg-white p-4 shadow-xl">
            <p className="text-lg font-semibold">Your organizer code has been generated.</p>
            <div className="mt-3 rounded border bg-slate-50 p-3">
              <p className="text-sm font-semibold">Organizer Code</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded bg-white px-2 py-1 font-mono text-sm">{generatedOrganizerCodeModal.code}</code>
                <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={copyOrganizerCode}>
                  {generatedOrganizerCodeModal.copied ? "Copied" : "Copy"}
                </AppButton>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p className="font-semibold">Use this code to:</p>
              <p>✓ Unlock your dashboard and continue generating tickets.</p>
              <p>✓ Deliver QR tickets to your customers.</p>
              <p>✓ Unlock the QR scanner and validate tickets at the event.</p>
            </div>
            <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p><span className="font-semibold">Important:</span></p>
              <p>
                This code is extremely important. Please save it and <strong>do not share it with anyone you do not trust.</strong>
              </p>
              <p className="mt-2">
                - If you lose this code, you will lose access to your events and tickets. <strong>There is no way to recover it.</strong>
              </p>
              <p>- If the code is lost, you will need to create a new event and generate new tickets.</p>
            </div>
            <div className="mt-4 flex justify-end">
              <AppButton type="button" variant="primary" onClick={closeOrganizerCodeModal}>
                I saved the code
              </AppButton>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
