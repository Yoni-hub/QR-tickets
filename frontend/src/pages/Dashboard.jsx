import { useCallback, useEffect, useMemo, useRef, useState, useReducer } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import AppButton from "../components/ui/AppButton";
import FeedbackBanner from "../components/ui/FeedbackBanner";
import { withMinDelay } from "../lib/withMinDelay";
import TicketEditor from "../components/ticket-editor/TicketEditor";
import PublicEventExperience from "../components/public/PublicEventExperience";
import ChatInboxLayout from "../features/chat/ChatInboxLayout";
import { organizerChatApi } from "../features/chat/chatApi";
import ModalOverlay from "../components/ui/ModalOverlay";

function useFeedback(autoClearMs = 5000) {
  const [fb, setFb] = useState({ kind: "", message: "" });
  const timerRef = useRef(null);
  // setter: setXxxFb("success", "msg") or setXxxFb("", "") to clear
  const set = (kind, message) => {
    clearTimeout(timerRef.current);
    setFb({ kind, message });
    if (message && autoClearMs > 0) {
      timerRef.current = setTimeout(() => setFb({ kind: "", message: "" }), autoClearMs);
    }
  };
  return [fb, set];
}

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
  { id: "notifications", label: "Notifications" },
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

const LOCAL_SAVED_CODE_KEY = "qr-dashboard:saved-code";

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
  const VALID_MENU_IDS = ["events", "tickets", "delivery", "requests", "chat", "promoters", "notifications"];
  const activeMenu = VALID_MENU_IDS.includes(String(params.get("menu") || "").toLowerCase())
    ? String(params.get("menu")).toLowerCase()
    : "events";
  const setActiveMenu = useCallback((menuId) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("menu", menuId);
      return next;
    }, { replace: true });
  }, [setParams]);
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
  const [autoApprove, setAutoApprove] = useState(false);
  const [togglingAutoApprove, setTogglingAutoApprove] = useState(false);
  const [promoters, setPromoters] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState(DELIVERY_METHODS.PDF);
  const [pdfTicketCount, setPdfTicketCount] = useState("");
  const [pdfTicketsPerPage, setPdfTicketsPerPage] = useState(2);
  const [emailMode, setEmailMode] = useState("single"); // 'single' | 'bulk-same' | 'bulk-table'
  const [singleEmail, setSingleEmail] = useState("");
  const [emailQuantities, setEmailQuantities] = useState({}); // {[ticketType]: number}
  const [bulkEmails, setBulkEmails] = useState("");
  const [tableRecipients, setTableRecipients] = useState([{ id: 1, email: "", quantities: {} }]);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [sendSummary, setSendSummary] = useState(null);
  const [loadFb, setLoadFb] = useFeedback();
  const [eventFb, setEventFb] = useFeedback();
  const [ticketFb, setTicketFb] = useFeedback(10000);
  const [deliveryFb, setDeliveryFb] = useFeedback();
  const [requestFb, setRequestFb] = useFeedback();
  const [promoterFb, setPromoterFb] = useFeedback();
  const [chatFb, setChatFb] = useFeedback();
  const [notifFb, setNotifFb] = useFeedback();
  const [notifDraft, setNotifDraft] = useState({ organizerEmail: "", notifyOnRequest: false, notifyOnMessage: false });
  const [notifLoaded, setNotifLoaded] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
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
  const organizerNameRef = useRef(null);
  const [showGetStartedHint, setShowGetStartedHint] = useState(false);
  const getStartedHintTimerRef = useRef(null);
  const copyResetTimersRef = useRef({
    publicEventLink: null,
    ticketPublicId: null,
    promoterId: null,
  });

  // Preview data for email digest sample (previewTicketLinks depends on deliveryTicketTypeOptions — defined below)
  const previewEventName = summary?.event?.eventName || "Your Event";
  const previewEventDate = summary?.event?.eventDate ? new Date(summary.event.eventDate).toLocaleString() : "Event date";
  const previewEventAddress = summary?.event?.eventAddress || "Event address";

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
  const pendingRequestCount = useMemo(
    () => ticketRequests.filter((r) => r.status === "PENDING_VERIFICATION").length,
    [ticketRequests],
  );
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

  const previewTicketLinks = deliveryTicketTypeOptions.map((type) => ({
    ticketType: type,
    ticketUrl: `${window.location.origin}/t/SAMPLE-${type.toUpperCase()}`,
  }));

  // Initialise emailQuantities when ticket types become available
  useEffect(() => {
    if (!deliveryTicketTypeOptions.length) return;
    setEmailQuantities((prev) => {
      const next = { ...prev };
      for (const type of deliveryTicketTypeOptions) {
        if (!(type in next)) next[type] = "";
      }
      return next;
    });
  }, [deliveryTicketTypeOptions]);
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

  // Available count per ticket type (for inline email delivery validation)
  const availableCountByType = useMemo(() => {
    const map = {};
    for (const ticket of deliverableTickets) {
      const type = String(ticket.ticketType || summary?.event?.ticketType || DEFAULT_TICKET_TYPE).trim();
      map[type] = (map[type] || 0) + 1;
    }
    return map;
  }, [deliverableTickets, summary?.event?.ticketType]);

  useEffect(() => {
    if (!shouldOpenHomeMode) return;
    setCode("");
    setLoadFb("", "");
    setSummary(null);
    setEvents([]);
    setSelectedEventId("");
    setTickets([]);
    setTicketDeliverySummary({ undeliveredTickets: 0, pendingRequestedTickets: 0, downloadableTickets: 0 });
    setTicketRequests([]);
    setPromoters([]);
    setLeaderboard([]);
    setNotifLoaded(false);
    setActiveMenu("events");
    setShowPublicPreview(false);
    setEventEditMode(EVENT_EDIT_MODES.CREATE);
    setEventDraft({ organizerName: "", eventName: "", eventDate: "", eventAddress: "", paymentInstructions: "" });
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
    if (shouldOpenHomeMode || summary) return;
    const urlCode = params.get("code");
    const codeToLoad = urlCode || localStorage.getItem(LOCAL_SAVED_CODE_KEY) || "";
    if (codeToLoad) {
      setCode(codeToLoad);
      void loadDashboard(codeToLoad);
    }
  }, [shouldOpenHomeMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Poll chat unread count in background when not on the chat menu
  useEffect(() => {
    if (!organizerChatAccessCode || activeMenu === "chat") return undefined;
    const fetchUnread = async () => {
      try {
        const res = await organizerChatApi.listConversations(organizerChatAccessCode);
        const items = res.data?.items || [];
        setChatUnreadTotal(items.reduce((sum, item) => sum + (item.unreadCount || 0), 0));
      } catch {
        // ignore
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [organizerChatAccessCode, activeMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll pending ticket requests count in background when not on the requests menu
  useEffect(() => {
    if (!accessCode || !summary?.event?.id || activeMenu === "requests") return undefined;
    const poll = async () => {
      try {
        const res = await api.get(`/events/by-code/${encodeURIComponent(accessCode)}/ticket-requests`, {
          params: { eventId: summary.event.id },
        });
        setTicketRequests(res.data.items || []);
      } catch {
        // ignore
      }
    };
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [accessCode, summary?.event?.id, activeMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPdfTicketCount("");
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
    setLoadFb("error", message);
    return true;
  }, []);

  const loadRequestsAndPromoters = async (targetCode, targetEventId) => {
    if (!targetCode || !targetEventId) return;
    const [requestRes, promoterRes, autoApproveRes] = await Promise.all([
      api.get(`/events/by-code/${encodeURIComponent(targetCode)}/ticket-requests`, {
        params: { eventId: targetEventId },
      }),
      api.get(`/events/by-code/${encodeURIComponent(targetCode)}/promoters`, {
        params: { eventId: targetEventId },
      }),
      api.get(`/events/by-code/${encodeURIComponent(targetCode)}/auto-approve`, {
        params: { eventId: targetEventId },
      }),
    ]);
    setTicketRequests(requestRes.data.items || []);
    setPromoters(promoterRes.data.items || []);
    setLeaderboard(promoterRes.data.leaderboard || []);
    setAutoApprove(autoApproveRes.data.autoApprove ?? false);
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
    setLoadFb("", "");
    setSendSummary(null);
    if (location.pathname === "/") {
      navigate(`/dashboard?code=${encodeURIComponent(trimmedCode)}&menu=events`, { replace: true });
    } else {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("code", trimmedCode);
        next.set("menu", "events");
        return next;
      });
    }

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
      setLoadFb("success", "Dashboard loaded.");
      window.localStorage.setItem("qr-dashboard:loaded-once", "1");
      localStorage.setItem(LOCAL_SAVED_CODE_KEY, trimmedCode);
      window.dispatchEvent(new Event("qr-dashboard-nav-updated"));
    } catch (requestError) {
      setLoadFb("error", requestError.response?.data?.error || "Unable to load dashboard.");
      setSummary(null);
      setEvents([]);
      setSelectedEventId("");
      setTickets([]);
      setTicketDeliverySummary({ undeliveredTickets: 0, pendingRequestedTickets: 0, downloadableTickets: 0 });
      setTicketRequests([]);
      setPromoters([]);
      setLeaderboard([]);
      setNotifLoaded(false);
      setTicketTypeFilter("ALL");
      setTicketStatusFilter(TICKET_STATUS_FILTERS.TOTAL);
    } finally {
      setLoading(false);
    }
  }, [loading, setParams, applySummaryEvent, navigate, location.pathname]);

  const load = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setLoadFb("info", "New here? Fill in your event details to generate your access code.");
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
      setTicketFb("error", "Could not copy ticket URL.");
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
      setTicketFb("success", `Ticket ${ticket.ticketPublicId} cancelled.`);
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

  const toggleAutoApprove = async () => {
    if (togglingAutoApprove || !accessCode || !summary?.event?.id) return;
    setTogglingAutoApprove(true);
    try {
      const next = !autoApprove;
      await api.patch(`/events/by-code/${encodeURIComponent(accessCode)}/auto-approve`, {
        autoApprove: next,
        eventId: summary.event.id,
      });
      setAutoApprove(next);
      setRequestFb("success", next ? "Auto-approve enabled — new requests will be approved instantly." : "Auto-approve disabled — requests need manual approval.");
    } catch {
      setRequestFb("error", "Could not update auto-approve setting.");
    } finally {
      setTogglingAutoApprove(false);
    }
  };

  const approveRequest = async (requestId) => {
    const requestItem = ticketRequests.find((item) => item.id === requestId);
    if (requestItem?.status === "CANCELLED") {
      setRequestFb("info", "request already cancelled");
      return;
    }
    if (requestItem?.status === "APPROVED") {
      setRequestFb("info", "request already approved");
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
      setRequestFb("success", "Request approved and ticket Assigned to client.");
    } catch (requestError) {
      setRequestFb("error", requestError.response?.data?.error || "Approve failed.");
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
        setRequestFb("error", requestError.response?.data?.error || "Could not load chat.");
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
      setChatFb("error", requestError.response?.data?.error || "Could not send message.");
    } finally {
      setChatSending(false);
    }
  };

  const loadNotifications = async () => {
    if (!accessCode || notifLoaded) return;
    try {
      const res = await api.get(`/events/by-code/${accessCode}/notifications`);
      setNotifDraft({ organizerEmail: res.data.organizerEmail || "", notifyOnRequest: res.data.notifyOnRequest, notifyOnMessage: res.data.notifyOnMessage });
      setNotifLoaded(true);
    } catch {
      // silently ignore — will show empty form
      setNotifLoaded(true);
    }
  };

  const saveNotifications = async () => {
    if (!accessCode || savingNotif) return;
    setSavingNotif(true);
    try {
      await api.patch(`/events/by-code/${accessCode}/notifications`, notifDraft);
      setNotifFb("success", "Notification preferences saved.");
    } catch {
      setNotifFb("error", "Could not save preferences.");
    } finally {
      setSavingNotif(false);
    }
  };

  const addPromoter = async () => {
    if (!promoterForm.name.trim()) {
      setPromoterFb("error", "Promoter name is required.");
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
      setPromoterFb("success", "Promoter added.");
    } catch (requestError) {
      setPromoterFb("error", requestError.response?.data?.error || "Could not add promoter.");
    }
  };

  const deletePromoter = async (promoterId) => {
    try {
      await api.delete(`/promoters/${encodeURIComponent(promoterId)}`, {
        data: { accessCode, eventId: summary?.event?.id },
      });
      await loadRequestsAndPromoters(accessCode, summary?.event?.id);
      setPromoterFb("info", "Promoter deleted.");
    } catch (requestError) {
      setPromoterFb("error", requestError.response?.data?.error || "Delete failed.");
    }
  };

  const downloadPdf = async (skipWarning = false) => {
    if (!summary?.event?.id || downloading) return;
    if (deliverableCount < 1) {
      setDeliveryFb("error", "No tickets available. Go to the Tickets menu to generate more.");
      return;
    }
    const requestedCount = Number.parseInt(String(pdfTicketCount || ""), 10);
    if (Number.isNaN(requestedCount) || requestedCount < 1) {
      setDeliveryFb("error", "Enter how many tickets you want to download.");
      return;
    }
    if (requestedCount > deliverableCount) {
      setDeliveryFb("error", `You only have ${deliverableCount} ticket${deliverableCount !== 1 ? "s" : ""} available. Update the number and try again.`);
      return;
    }
    if (!deliveryWarningAcknowledged && skipWarning !== true) {
      openDeliveryWarningModal("download-pdf");
      return;
    }
    const safeCount = requestedCount;
    setDownloading(true);
    setDeliveryFb("", "");
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
        setDeliveryFb("info", "All tickets downloaded.");
      } else {
        setDeliveryFb("success", `Downloaded ${downloadedCount} ticket(s). You have ${remainingAfterDownload} tickets left to deliver.`);
      }
    } catch (requestError) {
      setDeliveryFb("error", requestError.response?.data?.error || requestError.message || "Could not download tickets PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const buildRecipients = () => {
    const selections = Object.entries(emailQuantities)
      .map(([ticketType, raw]) => ({ ticketType, quantity: parseInt(raw || "0", 10) || 0 }))
      .filter(({ quantity }) => quantity > 0);

    if (emailMode === "single") {
      const email = singleEmail.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
      if (!selections.length) return null;
      return [{ email, selections }];
    }

    if (emailMode === "bulk-same") {
      if (!selections.length) return null;
      const emails = bulkEmails
        .split(/[\n,]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      const unique = [...new Set(emails)];
      if (!unique.length) return null;
      return unique.map((email) => ({ email, selections }));
    }

    if (emailMode === "bulk-table") {
      const result = [];
      for (const row of tableRecipients) {
        const email = row.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
        const rowSelections = Object.entries(row.quantities)
          .map(([ticketType, raw]) => ({ ticketType, quantity: parseInt(raw || "0", 10) || 0 }))
          .filter(({ quantity }) => quantity > 0);
        if (rowSelections.length) result.push({ email, selections: rowSelections });
      }
      return result.length ? result : null;
    }

    return null;
  };

  // Compute total requested per type across all table rows (for inline validation)
  const tableRequestedByType = useMemo(() => {
    if (emailMode !== "bulk-table") return {};
    const map = {};
    for (const row of tableRecipients) {
      for (const [type, raw] of Object.entries(row.quantities)) {
        const qty = parseInt(raw || "0", 10) || 0;
        if (qty > 0) map[type] = (map[type] || 0) + qty;
      }
    }
    return map;
  }, [emailMode, tableRecipients]);

  // Same for single/bulk-same modes
  const emailRequestedByType = useMemo(() => {
    if (emailMode === "bulk-table") return {};
    const multiplier = emailMode === "bulk-same"
      ? Math.max(1, bulkEmails.split(/[\n,]+/).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).length)
      : 1;
    const map = {};
    for (const [type, raw] of Object.entries(emailQuantities)) {
      const qty = parseInt(raw || "0", 10) || 0;
      if (qty > 0) map[type] = qty * multiplier;
    }
    return map;
  }, [emailMode, emailQuantities, bulkEmails]);

  const addTableRow = () => setTableRecipients((prev) => [
    ...prev,
    { id: Date.now(), email: "", quantities: {} },
  ]);

  const removeTableRow = (id) => setTableRecipients((prev) => prev.filter((r) => r.id !== id));

  const updateTableRow = (id, field, value) => setTableRecipients((prev) =>
    prev.map((r) => r.id === id ? { ...r, [field]: value } : r),
  );

  const updateTableRowQty = (id, type, value) => setTableRecipients((prev) =>
    prev.map((r) => r.id === id ? { ...r, quantities: { ...r.quantities, [type]: value.replace(/[^0-9]/g, "") } } : r),
  );

  const sendTicketLinks = async (skipWarning = false) => {
    if (!accessCode || sending) return;

    const recipients = buildRecipients();
    if (!recipients || !recipients.length) {
      if (emailMode === "single") {
        setDeliveryFb("error", "Enter a valid email and at least one ticket quantity.");
      } else if (emailMode === "bulk-same") {
        setDeliveryFb("error", "Add at least one valid email and set ticket quantities.");
      } else {
        setDeliveryFb("error", "Add at least one valid row with an email and ticket quantity.");
      }
      return;
    }

    if (!deliveryWarningAcknowledged && skipWarning !== true) {
      openDeliveryWarningModal("send-ticket-links");
      return;
    }

    setSending(true);
    setDeliveryFb("", "");
    setSendSummary(null);
    try {
      const response = await withMinDelay(
        api.post(`/orders/${encodeURIComponent(accessCode)}/send-links`, {
          recipients,
          eventId: summary?.event?.id,
          baseUrl: window.location.origin,
        }),
      );
      setSendSummary(response.data);
      setSingleEmail("");
      setBulkEmails("");
      setTableRecipients([{ id: 1, email: "", quantities: {} }]);
      await loadTicketsForEvent(summary.event.id);
      const totalSent = response.data.totalSent || 0;
      const failCount = response.data.failed?.length || 0;
      if (failCount > 0) {
        setDeliveryFb("info", `Sent ${totalSent} ticket(s). ${failCount} email(s) failed — check results below.`);
      } else {
        setDeliveryFb("success", `Successfully sent ${totalSent} ticket(s) to ${recipients.length} recipient(s).`);
      }
    } catch (requestError) {
      const responseData = requestError.response?.data || {};
      setDeliveryFb("error", responseData.error || "Could not send ticket links.");
    } finally {
      setSending(false);
    }
  };

  const handleTicketsGenerated = async () => {
    if (!summary?.event?.id || !accessCode) return;
    await loadTicketsForEvent(summary.event.id);
    setTicketPage(1);
    setTicketFb("success", "Tickets generated! Head to the Delivery menu to start sending tickets to your customers.");
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
          setTicketFb("error", "Could not copy ticket URL.");
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
      setEventFb("error", "Event name, date, and location are required.");
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
          setEventFb("success", "Event created and organizer code generated.");
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
        setEventFb("success", "New event created.");
        return;
      }

      if (!summary?.event?.id) {
        setEventFb("error", "Load an event first.");
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
      setEventFb("success", "Event details updated.");
    } catch (requestError) {
      if (handleTicketLockError(requestError)) return;
      setEventFb("error", requestError.response?.data?.error || "Could not update event.");
    } finally {
      setSavingEvent(false);
    }
  };

  const switchToCreateEventMode = () => {
    setEventEditMode(EVENT_EDIT_MODES.CREATE);
    setSelectedEventId("");
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
    if (!eventId || !accessCode) return;
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
      setTicketFb("success", "Ticket editor changes saved.");
    } catch (requestError) {
      if (handleTicketLockError(requestError)) return;
      setTicketFb("error", requestError.response?.data?.error || "Could not save ticket changes.");
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
      setPromoterFb("error", "Could not copy promoter link.");
    }
  };

  const copyPublicEventLink = async (skipWarning = false) => {
    if (!summary?.event?.slug) return;
    if (noDeliverableTickets) {
      setDeliveryFb("error",
        pendingRequestedCount > 0
          ? "You have no free tickets to deliver right now because pending public requests reserved them."
          : "You have no more tickets to deliver and downloaded all tickets. Generate more before sharing public link.",
      );
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
      setDeliveryFb("error", "Could not copy public event link.");
    }
  };

  const handleGetStarted = () => {
    if (organizerNameRef.current) {
      organizerNameRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      organizerNameRef.current.focus();
    }
    clearTimeout(getStartedHintTimerRef.current);
    setShowGetStartedHint(true);
    getStartedHintTimerRef.current = setTimeout(() => setShowGetStartedHint(false), 10000);
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

      <FeedbackBanner className="mt-3" kind={loadFb.kind} message={loadFb.message} />

      {(!showLoadDashboard || summary) && !showHeroSection ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
          {visibleMenus.map((menu) => (
            <button
              key={menu.id}
              type="button"
              onClick={() => { setActiveMenu(menu.id); if (menu.id === "notifications") loadNotifications(); }}
              className={`relative rounded border px-3 py-1.5 ${activeMenu === menu.id ? "bg-slate-900 text-white" : "bg-white text-slate-800"}`}
            >
              {menu.label}
              {menu.id === "chat" && chatUnreadTotal > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                  {chatUnreadTotal > 99 ? "99+" : chatUnreadTotal}
                </span>
              ) : null}
              {menu.id === "requests" && pendingRequestCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
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
                    {!selectedEventId && (
                      <option value="">— select an existing event —</option>
                    )}
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
                <FeedbackBanner className="mt-3" kind={eventFb.kind} message={eventFb.message} />
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
              <FeedbackBanner className="mb-3" kind={ticketFb.kind} message={ticketFb.message} />
              {ticketFb.kind === "success" && ticketFb.message.startsWith("Tickets generated") ? (
                <div className="mb-3">
                  <AppButton variant="primary" onClick={() => setActiveMenu("delivery")}>Go to Delivery →</AppButton>
                </div>
              ) : null}
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
                      {ticket.status === "USED" ? (
                        <span className="inline-block rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-500">Scanned — cannot cancel</span>
                      ) : (
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
                      )}
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
                          {ticket.status === "USED" ? (
                            <span className="inline-block rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-500">Scanned — cannot cancel</span>
                          ) : isTicketSold(ticket) ? (
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
                  {deliverableCount < 1 ? (
                    <div className="rounded border border-amber-300 bg-amber-50 p-4">
                      <p className="font-semibold text-amber-900">No tickets available to download.</p>
                      <p className="mt-1 text-sm text-amber-800">
                        {pdfDeliveredCount > 0
                          ? `You've already downloaded all ${pdfDeliveredCount} ticket(s) as PDF.`
                          : "All your tickets have been delivered through other methods."}
                        {" "}Generate more tickets to continue.
                      </p>
                      <AppButton className="mt-3" variant="secondary" onClick={() => setActiveMenu("tickets")}>
                        Go to Tickets → Generate More
                      </AppButton>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                        <span className="font-semibold text-emerald-800">{deliverableCount} ticket{deliverableCount !== 1 ? "s" : ""} ready to download.</span>
                        {pdfDeliveredCount > 0 ? <span className="ml-2 text-emerald-700">{pdfDeliveredCount} already downloaded.</span> : null}
                      </div>
                      <label className="mb-1 block text-sm font-medium">How many tickets to download?</label>
                      <input
                        className="w-full rounded border p-2 text-sm sm:w-44"
                        type="number"
                        min={1}
                        max={deliverableCount}
                        placeholder={`1 – ${deliverableCount}`}
                        value={pdfTicketCount}
                        onChange={(event) => setPdfTicketCount(event.target.value)}
                        disabled={downloading}
                      />
                      {pendingRequestedCount > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">
                          {pendingRequestedCount} ticket(s) are reserved for pending public requests and are not included in your {deliverableCount} available.
                        </p>
                      ) : null}
                      <label className="mb-1 mt-3 block text-sm font-medium">Tickets per page</label>
                      <select className="w-full rounded border p-2 text-sm sm:w-44" value={pdfTicketsPerPage} onChange={(event) => setPdfTicketsPerPage(Number.parseInt(event.target.value, 10) || 2)} disabled={downloading}>
                        {PDF_TICKETS_PER_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                      <AppButton className="mt-3" variant="secondary" onClick={() => void downloadPdf()} loading={downloading} loadingText="Downloading...">Download Tickets PDF</AppButton>
                    </>
                  )}
                </div>
              ) : null}

              {deliveryMethod === DELIVERY_METHODS.EMAIL_LINK ? (
                <div className="mt-3 space-y-4">

                  {/* Mode tabs */}
                  <div className="flex gap-1 rounded border bg-slate-100 p-1 text-xs font-medium sm:w-fit">
                    {[
                      { id: "single", label: "Single recipient" },
                      { id: "bulk-same", label: "Bulk — same tickets" },
                      { id: "bulk-table", label: "Bulk — per person" },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`rounded px-3 py-1.5 transition-colors ${emailMode === id ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                        onClick={() => setEmailMode(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Tickets per recipient — single + bulk-same modes */}
                  {(emailMode === "single" || emailMode === "bulk-same") ? (
                    <div>
                      <p className="mb-2 text-sm font-medium">Tickets per recipient</p>
                      <div className="flex flex-wrap gap-3">
                        {deliveryTicketTypeOptions.map((type) => {
                          const available = availableCountByType[type] || 0;
                          const requested = emailRequestedByType[type] || 0;
                          const exceeded = requested > 0 && requested > available;
                          const remaining = Math.max(0, available - requested);
                          return (
                            <div key={type} className={`flex flex-col gap-1 rounded border px-3 py-2 bg-white ${exceeded ? "border-red-400" : ""}`}>
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-slate-700 min-w-[60px]">{type}</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="w-16 rounded border p-1 text-center text-sm"
                                  value={emailQuantities[type] ?? ""}
                                  placeholder="0"
                                  onChange={(e) => setEmailQuantities((prev) => ({ ...prev, [type]: e.target.value.replace(/[^0-9]/g, "") }))}
                                />
                              </div>
                              {exceeded
                                ? <p className="text-xs text-red-600">Only {available} available</p>
                                : <p className="text-xs text-slate-400">{remaining} available</p>
                              }
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* Single recipient email input */}
                  {emailMode === "single" ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Recipient email</label>
                      <input
                        type="email"
                        className="w-full rounded border p-2 text-sm"
                        placeholder="alice@example.com"
                        value={singleEmail}
                        onChange={(e) => setSingleEmail(e.target.value)}
                      />
                    </div>
                  ) : null}

                  {/* Bulk same — email list */}
                  {emailMode === "bulk-same" ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Recipient emails (one per line)</label>
                      <textarea
                        className="w-full rounded border p-2 text-sm"
                        rows={5}
                        placeholder={"alice@example.com\nbob@example.com\ncharlie@example.com"}
                        value={bulkEmails}
                        onChange={(e) => setBulkEmails(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {bulkEmails.split(/[\n,]+/).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).length} valid email(s) detected
                      </p>
                    </div>
                  ) : null}

                  {/* Bulk table — one row per recipient, different quantities */}
                  {emailMode === "bulk-table" ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Recipients</p>
                      {/* Rows */}
                      {tableRecipients.map((row) => (
                        <div key={row.id} className="rounded border bg-white p-2 space-y-2">
                          {/* Row 1: email + remove button */}
                          <div className="flex items-center gap-2">
                            <input
                              type="email"
                              className="flex-1 min-w-0 rounded border p-2 text-sm"
                              placeholder="alice@example.com"
                              value={row.email}
                              onChange={(e) => updateTableRow(row.id, "email", e.target.value)}
                            />
                            <button
                              type="button"
                              className="flex-none rounded text-slate-400 hover:text-red-500 text-lg leading-none px-1"
                              onClick={() => removeTableRow(row.id)}
                              disabled={tableRecipients.length === 1}
                            >
                              ✕
                            </button>
                          </div>
                          {/* Row 2: quantity inputs per ticket type */}
                          <div className="flex flex-wrap gap-2">
                            {deliveryTicketTypeOptions.map((type) => {
                              const available = availableCountByType[type] || 0;
                              const totalRequested = tableRequestedByType[type] || 0;
                              const exceeded = totalRequested > available;
                              return (
                                <div key={type} className="flex items-center gap-1">
                                  <span className="text-xs text-slate-500 whitespace-nowrap">{type}</span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    className={`w-14 rounded border p-1 text-center text-sm ${exceeded ? "border-red-400 bg-red-50" : ""}`}
                                    value={row.quantities[type] ?? ""}
                                    placeholder="0"
                                    onChange={(e) => updateTableRowQty(row.id, type, e.target.value)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {/* Per-type availability summary */}
                      <div className="flex flex-wrap gap-3 pt-1">
                        {deliveryTicketTypeOptions.map((type) => {
                          const available = availableCountByType[type] || 0;
                          const requested = tableRequestedByType[type] || 0;
                          if (requested === 0) return null;
                          return requested > available
                            ? <p key={type} className="text-xs text-red-600">{type}: {requested} requested — only {available} available</p>
                            : <p key={type} className="text-xs text-slate-500">{type}: {available - requested} available</p>;
                        })}
                      </div>
                      <button
                        type="button"
                        className="mt-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        onClick={addTableRow}
                      >
                        + Add recipient
                      </button>
                    </div>
                  ) : null}

                  {/* Email preview */}
                  <div className="rounded border bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700">Email preview (sample)</p>
                      <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => setShowEmailPreview((prev) => !prev)}>
                        {showEmailPreview ? "Hide" : "View preview"}
                      </AppButton>
                    </div>
                    {showEmailPreview ? (
                      <div className="mt-3 rounded border bg-white p-2">
                        <p className="mb-1 text-xs text-slate-500">To: alice@example.com</p>
                        <p className="mb-2 text-xs text-slate-500">Subject: <strong>Your tickets for {previewEventName} are ready</strong></p>
                        <div
                          className="overflow-hidden rounded text-sm [&_a]:break-all [&_table]:max-w-full [&_table]:w-full [&_td]:break-words"
                          dangerouslySetInnerHTML={{
                            __html: `
                              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;padding:8px 0;">
                                <tr><td align="center">
                                  <table width="480" cellpadding="20" cellspacing="0" role="presentation" style="background:#f5f7fb;border-radius:8px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;width:100%;max-width:480px;">
                                    <tr><td>
                                      <p style="margin:0 0 12px 0;font-size:18px;font-weight:700;text-align:center;">Your Tickets Are Ready</p>
                                      <p style="margin:0 0 10px 0;">Hello,</p>
                                      <p style="margin:0 0 14px 0;">Your tickets for <strong>${previewEventName}</strong> are ready.</p>
                                      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;text-align:left;">
                                        <tr><td style="padding:3px 10px 3px 0;">Event:</td><td><strong>${previewEventName}</strong></td></tr>
                                        <tr><td style="padding:3px 10px 3px 0;">Date:</td><td><strong>${previewEventDate}</strong></td></tr>
                                        <tr><td style="padding:3px 10px 3px 0;">Location:</td><td><strong>${previewEventAddress}</strong></td></tr>
                                      </table>
                                      <p style="margin:0 0 8px 0;">Use the links below to view your tickets:</p>
                                      <ul style="padding-left:18px;margin:0 0 16px 0;">
                                        ${previewTicketLinks.map((l) => `<li style="margin:5px 0;"><strong>${l.ticketType}:</strong> <a href="${l.ticketUrl}" style="color:#2d5bd1;">${l.ticketUrl}</a></li>`).join("")}
                                      </ul>
                                      <p style="margin:0;">Please present the QR code at the entrance.</p>
                                    </td></tr>
                                  </table>
                                </td></tr>
                              </table>
                            `,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <AppButton variant="indigo" onClick={() => void sendTicketLinks()} loading={sending} loadingText="Sending...">
                    Send tickets
                  </AppButton>
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

              <FeedbackBanner className="mt-3" kind={deliveryFb.kind} message={deliveryFb.message} />

              {sendSummary ? (
                <div className="mt-3 rounded border bg-emerald-50 p-3 text-sm space-y-1">
                  <p className="font-medium">Send complete — {sendSummary.totalSent} ticket(s) sent to {sendSummary.recipients} recipient(s)</p>
                  {sendSummary.failed?.length > 0 ? (
                    <div className="mt-2 text-red-700">
                      <p className="font-medium">Failed ({sendSummary.failed.length}):</p>
                      <ul className="mt-1 list-disc pl-4 text-xs">
                        {sendSummary.failed.map((f, i) => (
                          <li key={i}>{f.email} — {f.error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeMenu === "requests" ? (
            <section className="mt-4 rounded border p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold">Ticket requests</p>
                <button
                  type="button"
                  onClick={toggleAutoApprove}
                  disabled={togglingAutoApprove}
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${autoApprove ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  <span className={`h-2 w-2 rounded-full ${autoApprove ? "bg-emerald-500" : "bg-slate-400"}`} />
                  Auto-approve {autoApprove ? "ON" : "OFF"}
                </button>
              </div>
              {autoApprove ? (
                <p className="mt-1 text-xs text-emerald-700">New requests are approved instantly and buyers are notified by email.</p>
              ) : null}
              <FeedbackBanner className="mt-2" kind={requestFb.kind} message={requestFb.message} />
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
              <FeedbackBanner className="mt-2" kind={promoterFb.kind} message={promoterFb.message} />
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

          {activeMenu === "notifications" ? (
            <section className="mt-4 rounded border p-4">
              <p className="text-sm font-semibold">Notifications</p>
              <p className="mt-1 text-xs text-slate-500">
                Enter your email below to receive notifications when customers send a ticket request,
                reply to a message, or when the admin contacts you. Without this, you must log in
                to the dashboard regularly to check for new activity.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Your email address</label>
                  <input
                    className="w-full rounded border p-2 text-sm"
                    type="email"
                    placeholder="you@example.com"
                    value={notifDraft.organizerEmail}
                    onChange={(e) => setNotifDraft((prev) => ({ ...prev, organizerEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700">Notify me when:</label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={notifDraft.notifyOnRequest}
                      onChange={(e) => setNotifDraft((prev) => ({ ...prev, notifyOnRequest: e.target.checked }))}
                    />
                    <span>A customer submits a ticket request</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={notifDraft.notifyOnMessage}
                      onChange={(e) => setNotifDraft((prev) => ({ ...prev, notifyOnMessage: e.target.checked }))}
                    />
                    <span>A customer or the admin sends you a message</span>
                  </label>
                </div>
              </div>
              <AppButton className="mt-4" onClick={saveNotifications} loading={savingNotif} loadingText="Saving...">
                Save Preferences
              </AppButton>
              <FeedbackBanner className="mt-2" kind={notifFb.kind} message={notifFb.message} />
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
            <ModalOverlay>
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
            </ModalOverlay>
          ) : null}

          {chatContext ? (
            <ModalOverlay>
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
                <FeedbackBanner className="mt-2" kind={chatFb.kind} message={chatFb.message} />
              </section>
            </ModalOverlay>
          ) : null}

          {deliveryWarningModal.open ? (
            <ModalOverlay>
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
            </ModalOverlay>
          ) : null}

          {evidencePreview ? (
            <ModalOverlay className="bg-black/70">
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
            </ModalOverlay>
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
              {showGetStartedHint ? (
                <p className="mt-1 text-xs text-blue-700">Fill in your event details. You can update them anytime.</p>
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
        <ModalOverlay className="z-50 bg-black/50">
          <section className="w-full max-w-sm max-h-[80dvh] overflow-y-auto rounded border bg-white p-4 shadow-xl">
            <p className="font-semibold">Organizer code generated</p>
            <div className="mt-3 rounded border bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your Code</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded bg-white px-2 py-1 font-mono text-sm break-all">{generatedOrganizerCodeModal.code}</code>
                <AppButton type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={copyOrganizerCode}>
                  {generatedOrganizerCodeModal.copied ? "Copied" : "Copy"}
                </AppButton>
              </div>
            </div>
            <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Save this code — it cannot be recovered.</p>
              <p>Use it to access your dashboard, deliver tickets, and scan QR codes at the event.</p>
              <p>Do not share it with anyone you don't trust.</p>
            </div>
            <div className="mt-4 flex justify-end">
              <AppButton type="button" variant="primary" onClick={closeOrganizerCodeModal}>
                I saved the code
              </AppButton>
            </div>
          </section>
        </ModalOverlay>
      ) : null}
    </main>
  );
}
