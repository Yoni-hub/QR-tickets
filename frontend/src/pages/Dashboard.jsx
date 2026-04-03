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
import { useTurnstile } from "../hooks/useTurnstile";

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

const TAB_ICONS = {
  events: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  tickets: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
    </svg>
  ),
  requests: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
  chat: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  settings: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const DASHBOARD_MENUS_ALL = [
  { id: "events", label: "Events" },
  { id: "tickets", label: "Tickets" },
  { id: "requests", label: "Requests" },
  { id: "chat", label: "Chat" },
  { id: "settings", label: "Settings" },
];

const DASHBOARD_MENUS_PRELOAD = [
  { id: "events", label: "Events" },
];

const TICKET_STATUS_FILTERS = {
  TOTAL: "TOTAL",
  SOLD: "SOLD",
  SCANNED: "SCANNED",
};

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

// Convert a local datetime string ("YYYY-MM-DDTHH:mm") to a UTC ISO string before sending to the backend.
// Without this, the UTC server interprets the local time as UTC, shifting the stored time by the browser's offset.
function localDateTimeToISO(value) {
  if (!value) return value;
  const date = new Date(value); // browser treats "YYYY-MM-DDTHH:mm" as local time
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function resolveDefaultTicketType(value) {
  return String(value || "").trim() || DEFAULT_TICKET_TYPE;
}

function isTicketSold(ticket) {
  return Boolean(ticket?.ticketRequestId) || ticket?.status === "USED";
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

function DateTimeInput({ value, onChange, minDate, className = "" }) {
  const [datePart, timePart] = String(value || "").split("T");
  const [hStr, mStr] = (timePart || "").split(":");
  const h24 = parseInt(hStr || "", 10);
  const m = parseInt(mStr || "", 10);
  const isPm = !isNaN(h24) && h24 >= 12;
  const h12 = isNaN(h24) ? 12 : (h24 % 12 || 12);
  const minutes = isNaN(m) ? 0 : m;

  const emit = (d, newH24, newM) =>
    onChange(`${d || ""}T${String(newH24 ?? 0).padStart(2, "0")}:${String(newM ?? 0).padStart(2, "0")}`);

  const handleHourChange = (e) => {
    const n = parseInt(e.target.value, 10);
    const newH24 = isPm ? (n === 12 ? 12 : n + 12) : (n === 12 ? 0 : n);
    emit(datePart, newH24, minutes);
  };

  const handleMinChange = (e) => {
    emit(datePart, isNaN(h24) ? 0 : h24, parseInt(e.target.value, 10));
  };

  const toggleAmPm = () => {
    if (isNaN(h24)) return;
    emit(datePart, isPm ? h24 - 12 : h24 + 12, minutes);
  };

  return (
    <div className={`flex w-full items-center rounded border bg-white ${className}`}>
      <input
        type="date"
        value={datePart || ""}
        min={minDate}
        onChange={(e) => emit(e.target.value, isNaN(h24) ? 0 : h24, minutes)}
        className="min-w-0 flex-1 border-0 bg-transparent p-1.5 text-xs focus:outline-none"
      />
      <div className="flex shrink-0 items-center gap-0.5 border-l px-1.5 py-1.5">
        <select
          value={h12}
          onChange={handleHourChange}
          className="w-10 border-0 bg-transparent text-xs focus:outline-none"
        >
          {[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400">:</span>
        <select
          value={minutes}
          onChange={handleMinChange}
          className="w-12 border-0 bg-transparent text-xs focus:outline-none"
        >
          {Array.from({ length: 60 }, (_, i) => (
            <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
          ))}
        </select>
        <div className="ml-1 flex overflow-hidden rounded text-[10px] font-semibold">
          <button type="button" onClick={() => !isPm || toggleAmPm()} className={`px-1.5 py-0.5 ${!isPm ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>AM</button>
          <button type="button" onClick={() => isPm || toggleAmPm()} className={`px-1.5 py-0.5 ${isPm ? "bg-slate-800 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>PM</button>
        </div>
      </div>
    </div>
  );
}


export default function Dashboard() {
  const { containerRef: turnstileRef, getToken: getTurnstileToken } = useTurnstile();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const VALID_MENU_IDS = ["events", "tickets", "requests", "chat", "settings"];
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
  const [eventDraft, setEventDraft] = useState({ organizerName: "", eventName: "", eventDate: "", eventEndDate: "", eventAddress: "", paymentInstructions: "", salesCutoffAt: "", salesWindowStart: "", salesWindowEnd: "", maxTicketsPerEmail: "" });
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingTicketDraft, setSavingTicketDraft] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketRequests, setTicketRequests] = useState([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [togglingAutoApprove, setTogglingAutoApprove] = useState(false);
  const [promoters, setPromoters] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadFb, setLoadFb] = useFeedback();
  const [eventFb, setEventFb] = useFeedback();
  const [ticketFb, setTicketFb] = useFeedback(10000);
  const [requestFb, setRequestFb] = useFeedback();
  const [promoterFb, setPromoterFb] = useFeedback();
  const [chatFb, setChatFb] = useFeedback();
  const [notifFb, setNotifFb] = useFeedback();
  const [notifDraft, setNotifDraft] = useState({ organizerEmail: "", notifyOnRequest: false, notifyOnMessage: false, emailVerified: false });
  const [verifyGateModal, setVerifyGateModal] = useState({ open: false, pendingAction: null });
  const [gateEmailInput, setGateEmailInput] = useState("");
  const [gateOtpInput, setGateOtpInput] = useState("");
  const [gateOtpSent, setGateOtpSent] = useState(false);
  const [sendingGateOtp, setSendingGateOtp] = useState(false);
  const [verifyingGateOtp, setVerifyingGateOtp] = useState(false);
  const [gateEmailFb, setGateEmailFb] = useFeedback();
  const [gateMode, setGateMode] = useState("otp");
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [loadingRecovery, setLoadingRecovery] = useState(false);
  const [recoveryFb, setRecoveryFb] = useFeedback();
  const [pendingMerge, setPendingMerge] = useState(null);
  const [mergingEvent, setMergingEvent] = useState(false);
  const [notifLoaded, setNotifLoaded] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifEmailInput, setNotifEmailInput] = useState("");
  const [notifOtpInput, setNotifOtpInput] = useState("");
  const [notifOtpSent, setNotifOtpSent] = useState(false);
  const [notifEmailChanging, setNotifEmailChanging] = useState(false);
  const [sendingNotifOtp, setSendingNotifOtp] = useState(false);
  const [verifyingNotifOtp, setVerifyingNotifOtp] = useState(false);
  const [notifEmailFb, setNotifEmailFb] = useFeedback();
  const [promoterForm, setPromoterForm] = useState({ name: "" });
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [chatContext, setChatContext] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [evidencePreview, setEvidencePreview] = useState("");
  const [approvingRequestIds, setApprovingRequestIds] = useState(() => new Set());
  const [rejectingRequestIds, setRejectingRequestIds] = useState(() => new Set());
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
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [promotersOpen, setPromotersOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const ticketEditorDraftRef = useRef(null);
  const organizerNameRef = useRef(null);
  const dashboardLoadingRef = useRef(false);
  const [showGetStartedHint, setShowGetStartedHint] = useState(false);
  const getStartedHintTimerRef = useRef(null);
  const copyResetTimersRef = useRef({
    publicEventLink: null,
    ticketPublicId: null,
    promoterId: null,
  });

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
      return true;
    });
  }, [tickets, ticketTypeFilter, buyerSearch, ticketStatusFilter, summary?.event?.ticketType]);
  const totalTicketPages = Math.max(1, Math.ceil(filteredTickets.length / 5));
  const pagedTickets = filteredTickets.slice((ticketPage - 1) * 5, ticketPage * 5);
  const soldTicketsCount = useMemo(() => tickets.filter((ticket) => isTicketSold(ticket)).length, [tickets]);
  const scannedTicketsCount = useMemo(() => tickets.filter((ticket) => ticket.status === "USED").length, [tickets]);

  useEffect(() => {
    if (!shouldOpenHomeMode) return;
    setCode("");
    setLoadFb("", "");
    setSummary(null);
    setEvents([]);
    setSelectedEventId("");
    setTickets([]);
    setTicketRequests([]);
    setPromoters([]);
    setLeaderboard([]);
    setNotifLoaded(false);
    setActiveMenu("events");
    setShowPublicPreview(false);
    setEventEditMode(EVENT_EDIT_MODES.CREATE);
    setEventDraft({ organizerName: "", eventName: "", eventDate: "", eventEndDate: "", eventAddress: "", paymentInstructions: "" });
  }, [shouldOpenHomeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCopiedPublicEventLink(false);
    setCopiedTicketPublicId("");
    setCopiedPromoterId("");
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

  const applySummaryEvent = useCallback((payload) => {
    const nextEvents = Array.isArray(payload?.events) ? payload.events : [];
    setEvents(nextEvents);
    setSelectedEventId(String(payload?.event?.id || ""));
    setSummary(payload);
    setEventDraft({
      organizerName: String(payload?.event?.organizerName || ""),
      eventName: String(payload?.event?.eventName || ""),
      eventDate: toLocalDateTimeInputValue(payload?.event?.eventDate),
      eventEndDate: toLocalDateTimeInputValue(payload?.event?.eventEndDate),
      eventAddress: String(payload?.event?.eventAddress || ""),
      paymentInstructions: String(payload?.event?.paymentInstructions || ""),
      salesCutoffAt: toLocalDateTimeInputValue(payload?.event?.salesCutoffAt),
      salesWindowStart: String(payload?.event?.salesWindowStart || ""),
      salesWindowEnd: String(payload?.event?.salesWindowEnd || ""),
      maxTicketsPerEmail: payload?.event?.maxTicketsPerEmail != null ? String(payload.event.maxTicketsPerEmail) : "",
    });
    setEventEditMode(EVENT_EDIT_MODES.EDIT);
    // Seed emailVerified from event payload
    setNotifDraft((prev) => ({ ...prev, emailVerified: payload?.event?.emailVerified === true }));
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
  };

  const loadDashboard = useCallback(async (targetCode, requestedEventId = "") => {
    const trimmedCode = String(targetCode || "").trim();
    if (!trimmedCode || dashboardLoadingRef.current) return;
    dashboardLoadingRef.current = true;
    setLoading(true);
    setLoadFb("", "");
    setCode(trimmedCode);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("code", trimmedCode);
      next.set("menu", "events");
      return next;
    });

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
      setTicketRequests([]);
      setPromoters([]);
      setLeaderboard([]);
      setNotifLoaded(false);
      setTicketTypeFilter("ALL");
      setTicketStatusFilter(TICKET_STATUS_FILTERS.TOTAL);
    } finally {
      setLoading(false);
      dashboardLoadingRef.current = false;
    }
  }, [setParams, applySummaryEvent]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const copyTicketUrlRaw = async (ticket) => {
    const ticketPublicId = ticket?.ticketPublicId;
    if (!ticketPublicId) return;
    try {
      const url = `${window.location.origin}/t/${ticketPublicId}`;
      await navigator.clipboard.writeText(url);
      setTicketCopyError({ ticketPublicId: "", message: "" });
      markCopiedTicketPublicId(ticketPublicId);
    } catch {
      setTicketFb("error", "Could not copy ticket URL.");
    }
  };

  const copyTicketUrl = (ticket) => {
    if (!isOrganizerVerified) { openVerifyGate({ type: "copyTicketUrl", ticket }); return; }
    copyTicketUrlRaw(ticket);
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
    if (!cancelModal.reason) {
      setCancelModal((prev) => ({ ...prev, error: "Select a cancellation reason." }));
      return;
    }
    const requiresEvidence = Boolean(cancelModal.ticket?.ticketRequestId);
    if (requiresEvidence && !cancelModal.evidenceImageDataUrl) {
      setCancelModal((prev) => ({ ...prev, error: "Refund evidence is required." }));
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

  const rejectRequest = async (requestId) => {
    if (rejectingRequestIds.has(requestId)) return;
    setRejectingRequestIds((prev) => { const next = new Set(prev); next.add(requestId); return next; });
    try {
      await api.post(`/ticket-requests/${encodeURIComponent(requestId)}/reject`, {
        accessCode,
        eventId: summary?.event?.id,
      });
      await loadRequestsAndPromoters(accessCode, summary?.event?.id);
      setRequestFb("success", "Request rejected.");
    } catch (rejectError) {
      setRequestFb("error", rejectError.response?.data?.error || "Reject failed.");
    } finally {
      setRejectingRequestIds((prev) => { const next = new Set(prev); next.delete(requestId); return next; });
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
      const res = await api.get(`/events/by-code/${encodeURIComponent(accessCode)}/notifications`);
      setNotifDraft({ organizerEmail: res.data.organizerEmail || "", notifyOnRequest: res.data.notifyOnRequest, notifyOnMessage: res.data.notifyOnMessage, emailVerified: res.data.emailVerified ?? false });
      setNotifEmailInput(res.data.organizerEmail || "");
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
      await api.patch(`/events/by-code/${encodeURIComponent(accessCode)}/notifications`, { notifyOnRequest: notifDraft.notifyOnRequest, notifyOnMessage: notifDraft.notifyOnMessage });
      setNotifFb("success", "Notification preferences saved.");
    } catch {
      setNotifFb("error", "Could not save preferences.");
    } finally {
      setSavingNotif(false);
    }
  };

  const sendNotifEmailOtp = async () => {
    if (!accessCode || sendingNotifOtp) return;
    setSendingNotifOtp(true);
    setNotifEmailFb("", "");
    try {
      await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/notifications/send-email-otp`, { email: notifEmailInput });
      setNotifOtpSent(true);
      setNotifOtpInput("");
      setNotifEmailFb("success", "Verification code sent. Check your inbox.");
    } catch (err) {
      setNotifEmailFb("error", err.response?.data?.error || "Could not send code. Try again.");
    } finally {
      setSendingNotifOtp(false);
    }
  };

  const verifyNotifEmailOtp = async () => {
    if (!accessCode || verifyingNotifOtp) return;
    setVerifyingNotifOtp(true);
    setNotifEmailFb("", "");
    try {
      await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/notifications/verify-email-otp`, { email: notifEmailInput, code: notifOtpInput });
      setNotifDraft((prev) => ({ ...prev, organizerEmail: notifEmailInput, emailVerified: true }));
      setNotifOtpSent(false);
      setNotifOtpInput("");
      setNotifEmailChanging(false);
      setNotifEmailFb("success", "Email verified and saved.");
    } catch (err) {
      if (err.response?.data?.code === "EMAIL_ALREADY_REGISTERED") {
        setGateEmailInput(notifEmailInput);
        setGateOtpInput("");
        setGateOtpSent(false);
        setGateEmailFb("", "");
        setGateMode("recovery");
        setRecoveryCodeInput("");
        setRecoveryFb("", "");
        setVerifyGateModal({ open: true, pendingAction: null });
      } else {
        setNotifEmailFb("error", err.response?.data?.error || "Verification failed.");
      }
    } finally {
      setVerifyingNotifOtp(false);
    }
  };

  const isOrganizerVerified = notifDraft.emailVerified === true;

  const openVerifyGate = (pendingAction) => {
    setGateEmailInput(notifDraft.organizerEmail || "");
    setGateOtpInput("");
    setGateOtpSent(false);
    setGateEmailFb("", "");
    setGateMode("otp");
    setRecoveryCodeInput("");
    setRecoveryFb("", "");
    setVerifyGateModal({ open: true, pendingAction });
  };

  const closeVerifyGate = () => {
    setVerifyGateModal({ open: false, pendingAction: null });
    setGateMode("otp");
    setRecoveryCodeInput("");
    setRecoveryFb("", "");
  };

  const sendGateOtp = async () => {
    if (!accessCode || sendingGateOtp) return;
    setSendingGateOtp(true);
    setGateEmailFb("", "");
    try {
      await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/notifications/send-email-otp`, { email: gateEmailInput });
      setGateOtpSent(true);
      setGateOtpInput("");
      setGateEmailFb("success", "Verification code sent. Check your inbox.");
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "EMAIL_ALREADY_REGISTERED") {
        setGateMode("recovery");
        setRecoveryFb("", "");
      } else {
        setGateEmailFb("error", err.response?.data?.error || "Could not send code. Try again.");
      }
    } finally {
      setSendingGateOtp(false);
    }
  };

  const verifyGateOtp = async () => {
    if (!accessCode || verifyingGateOtp) return;
    setVerifyingGateOtp(true);
    setGateEmailFb("", "");
    try {
      await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/notifications/verify-email-otp`, { email: gateEmailInput, code: gateOtpInput });
      // Mark verified and auto-enable notifications
      setNotifDraft((prev) => ({ ...prev, organizerEmail: gateEmailInput, emailVerified: true, notifyOnRequest: true, notifyOnMessage: true }));
      setNotifLoaded(false); // force reload next time notifications tab is opened
      api.patch(`/events/by-code/${encodeURIComponent(accessCode)}/notifications`, { notifyOnRequest: true, notifyOnMessage: true }).catch(() => {});
      const pending = verifyGateModal.pendingAction;
      closeVerifyGate();
      // Execute the original pending action now that verified
      if (pending?.type === "shareEvent") shareEventRaw();
      else if (pending?.type === "copyEventLink") copyPublicEventLinkRaw();
      else if (pending?.type === "copyTicketUrl") copyTicketUrlRaw(pending.ticket);
    } catch (err) {
      const errCode = err.response?.data?.code;
      if (errCode === "EMAIL_ALREADY_REGISTERED") {
        setGateMode("recovery");
        setRecoveryFb("", "");
      } else {
        setGateEmailFb("error", err.response?.data?.error || "Verification failed. Try again.");
      }
    } finally {
      setVerifyingGateOtp(false);
    }
  };

  const loadAccount = async () => {
    const targetCode = recoveryCodeInput.trim();
    if (!targetCode || loadingRecovery) return;
    if (targetCode === accessCode) {
      setRecoveryFb("error", "That\u2019s the same code you\u2019re already using.");
      return;
    }
    setLoadingRecovery(true);
    setRecoveryFb("", "");
    const orphanCode = accessCode;
    try {
      await api.get(`/events/by-code/${encodeURIComponent(targetCode)}`);
      // Fetch orphan details for the merge prompt (best-effort)
      let orphanSummary = null;
      try {
        const orphanRes = await api.get(`/events/by-code/${encodeURIComponent(orphanCode)}`);
        orphanSummary = orphanRes.data;
      } catch {
        // orphan fetch failed — proceed without merge prompt
      }
      closeVerifyGate();
      localStorage.setItem(LOCAL_SAVED_CODE_KEY, targetCode);
      await loadDashboard(targetCode);
      if (orphanSummary) {
        setPendingMerge({ orphanAccessCode: orphanCode, summary: orphanSummary });
      }
    } catch (err) {
      setRecoveryFb("error", err.response?.data?.error || "Code not found. Check your email and try again.");
    } finally {
      setLoadingRecovery(false);
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


  const handleTicketsGenerated = async () => {
    if (!summary?.event?.id || !accessCode) return;
    await loadTicketsForEvent(summary.event.id);
    setTicketPage(1);
    setTicketFb("success", "Tickets generated! Start sharing your event to get buyers.");
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
    const startDate = eventDraft.eventDate ? new Date(eventDraft.eventDate) : null;
    if (startDate && startDate <= new Date()) {
      setEventFb("error", "Event start date must be in the future.");
      return;
    }
    const endDate = eventDraft.eventEndDate ? new Date(eventDraft.eventEndDate) : null;
    if (endDate && startDate && endDate <= startDate) {
      setEventFb("error", "Event end date must be after the start date.");
      return;
    }
    setSavingEvent(true);
    let cfTurnstileToken = "";
    try {
      cfTurnstileToken = await getTurnstileToken();
    } catch {
      setEventFb("error", "CAPTCHA verification failed. Please try again.");
      setSavingEvent(false);
      return;
    }
    try {
      if (eventEditMode === EVENT_EDIT_MODES.CREATE) {
        if (!accessCode) {
          const response = await api.post("/events", {
            organizerName: eventDraft.organizerName,
            eventName: eventDraft.eventName,
            eventDateTime: localDateTimeToISO(eventDraft.eventDate),
            eventEndDate: localDateTimeToISO(eventDraft.eventEndDate) || undefined,
            eventAddress: eventDraft.eventAddress,
            paymentInstructions: eventDraft.paymentInstructions,
            generateAccessOnly: true,
            cfTurnstileToken,
          });
          const nextOrganizerCode = String(
            response.data?.organizerAccessCode || response.data?.accessCode || "",
          ).trim();
          if (!nextOrganizerCode) {
            throw new Error("Organizer code was not generated.");
          }
          setCode(nextOrganizerCode);
          navigate(`/dashboard?code=${encodeURIComponent(nextOrganizerCode)}&menu=events`, { replace: true });
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
          eventDate: localDateTimeToISO(eventDraft.eventDate),
          eventEndDate: localDateTimeToISO(eventDraft.eventEndDate) || undefined,
          eventAddress: eventDraft.eventAddress,
          paymentInstructions: eventDraft.paymentInstructions,
          cfTurnstileToken,
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
        eventDate: localDateTimeToISO(eventDraft.eventDate),
        eventEndDate: localDateTimeToISO(eventDraft.eventEndDate),
        eventAddress: eventDraft.eventAddress,
        paymentInstructions: eventDraft.paymentInstructions,
        salesCutoffAt: localDateTimeToISO(eventDraft.salesCutoffAt) || null,
        salesWindowStart: eventDraft.salesWindowStart || null,
        salesWindowEnd: eventDraft.salesWindowEnd || null,
        maxTicketsPerEmail: eventDraft.maxTicketsPerEmail ? Number(eventDraft.maxTicketsPerEmail) : null,
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
                eventEndDate: response.data?.event?.eventEndDate ?? null,
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
      eventEndDate: "",
      eventAddress: "",
      paymentInstructions: "",
      salesCutoffAt: "",
      salesWindowStart: "",
      salesWindowEnd: "",
      maxTicketsPerEmail: "",
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
      eventEndDate: toLocalDateTimeInputValue(summary.event.eventEndDate),
      eventAddress: String(summary.event.eventAddress || ""),
      paymentInstructions: String(summary.event.paymentInstructions || ""),
      salesCutoffAt: toLocalDateTimeInputValue(summary.event.salesCutoffAt),
      salesWindowStart: String(summary.event.salesWindowStart || ""),
      salesWindowEnd: String(summary.event.salesWindowEnd || ""),
      maxTicketsPerEmail: summary.event.maxTicketsPerEmail != null ? String(summary.event.maxTicketsPerEmail) : "",
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
        payload.eventDate = localDateTimeToISO(draft.eventDate);
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
        eventEndDate: toLocalDateTimeInputValue(response.data?.event?.eventEndDate),
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


  const copyPromoterLink = async (promoterLink, promoterId = "") => {
    if (!promoterLink) return;
    try {
      await navigator.clipboard.writeText(promoterLink);
      markCopiedPromoterId(promoterId);
    } catch {
      setPromoterFb("error", "Could not copy promoter link.");
    }
  };

  const shareEventRaw = async () => {
    if (!summary?.event?.slug) return;
    const url = `${window.location.origin}/e/${summary.event.slug}`;
    const shareData = {
      title: summary.event.eventName || "Event",
      text: `Get your ticket for ${summary.event.eventName || "this event"}`,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled or share failed — ignore
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setEventFb("success", "Event link copied to clipboard.");
      } catch {
        setEventFb("error", "Could not copy event link.");
      }
    }
  };

  const shareEvent = () => {
    if (!isOrganizerVerified) { openVerifyGate({ type: "shareEvent" }); return; }
    shareEventRaw();
  };

  const copyPublicEventLinkRaw = async () => {
    if (!summary?.event?.slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/e/${summary.event.slug}`);
      markCopiedPublicEventLink();
    } catch {
      setTicketFb("error", "Could not copy public event link.");
    }
  };

  const copyPublicEventLink = () => {
    if (!isOrganizerVerified) { openVerifyGate({ type: "copyEventLink" }); return; }
    copyPublicEventLinkRaw();
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
    <>
      <div ref={turnstileRef} className="hidden" />
      {showHeroSection ? (
      <div className="w-full antialiased" style={{ background: "#ffffff", color: "#111827" }}>

        {/* Hero — split layout */}
        <section className="min-h-screen" style={{ background: "#fff" }}>
          <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
            {/* Left — headline */}
            <div className="flex flex-col justify-start px-8 py-10 lg:w-1/2 lg:px-16 lg:py-16" style={{ background: "linear-gradient(135deg, #eff4ff 0%, #fff 60%)" }}>
              <h1 className="text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl" style={{ color: "#111827" }}>
                Your event.<br />Your tickets.<br />
                <span style={{ color: "#2979ff" }}>Done in minutes.</span>
              </h1>
              <p className="mt-6 max-w-md text-lg leading-relaxed" style={{ color: "#6b7280" }}>
                No complicated setup. No tech headaches. Just create your event, share a link, and scan QR codes at the door.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleGetStarted}
                  className="rounded-xl px-8 py-4 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-90"
                  style={{ background: "#2979ff" }}
                >
                  Get started &rarr;
                </button>
                <button
                  type="button"
                  onClick={handleAlreadyHaveCode}
                  className="rounded-xl px-8 py-4 text-base font-semibold transition-colors hover:bg-gray-100"
                  style={{ background: "#f3f4f6", color: "#374151" }}
                >
                  Already have a code?
                </button>
              </div>
            </div>

            {/* Right — form */}
            <div className="flex items-center justify-center px-8 py-16 lg:w-1/2 lg:px-16" style={{ background: "#f9fafb" }}>
              <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl" style={{ border: "1px solid #e5e7eb" }}>
                <p className="mb-6 text-xl font-black" style={{ color: "#111827" }}>Create your event</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Organizer</label>
                    <input
                      ref={organizerNameRef}
                      className="w-full rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      style={{ border: "1px solid #e5e7eb", color: "#111827" }}
                      value={eventDraft.organizerName}
                      onChange={(e) => setEventDraft((prev) => ({ ...prev, organizerName: e.target.value }))}
                      placeholder="Organizer or brand name"
                    />
                    {showGetStartedHint ? (
                      <p className="mt-1 text-xs" style={{ color: "#2979ff" }}>Fill in your event details. You can update them anytime.</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Event Name</label>
                    <input
                      className="w-full rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      style={{ border: "1px solid #e5e7eb", color: "#111827" }}
                      value={eventDraft.eventName}
                      onChange={(e) => setEventDraft((prev) => ({ ...prev, eventName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Start Date</label>
                    <DateTimeInput
                      value={eventDraft.eventDate}
                      onChange={(v) => setEventDraft((prev) => ({ ...prev, eventDate: v }))}
                      minDate={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>End Date</label>
                    <DateTimeInput
                      value={eventDraft.eventEndDate}
                      onChange={(v) => setEventDraft((prev) => ({ ...prev, eventEndDate: v }))}
                      minDate={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Location</label>
                    <input
                      className="w-full rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      style={{ border: "1px solid #e5e7eb", color: "#111827" }}
                      value={eventDraft.eventAddress}
                      onChange={(e) => setEventDraft((prev) => ({ ...prev, eventAddress: e.target.value }))}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedSettingsOpen((prev) => !prev)}
                  className="mt-4 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50"
                  style={{ border: "1px solid #e5e7eb" }}
                >
                  <span>Advanced Settings</span>
                  <span>{advancedSettingsOpen ? "▲" : "▼"}</span>
                </button>
                {advancedSettingsOpen ? (
                  <div className="mt-2 space-y-4 rounded-xl border p-4 text-sm" style={{ border: "1px solid #e5e7eb" }}>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Stop selling after</label>
                      <DateTimeInput
                        value={eventDraft.salesCutoffAt}
                        onChange={(v) => setEventDraft((prev) => ({ ...prev, salesCutoffAt: v }))}
                        minDate={new Date().toISOString().slice(0, 10)}
                      />
                      {eventDraft.salesCutoffAt ? (
                        <button type="button" className="mt-1 text-xs text-slate-400 underline" onClick={() => setEventDraft((prev) => ({ ...prev, salesCutoffAt: "" }))}>Clear</button>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Sell tickets from</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={eventDraft.salesWindowStart}
                          onChange={(e) => setEventDraft((prev) => ({ ...prev, salesWindowStart: e.target.value }))}
                          className="rounded border p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                        />
                        <span className="text-slate-500">to</span>
                        <input
                          type="time"
                          value={eventDraft.salesWindowEnd}
                          onChange={(e) => setEventDraft((prev) => ({ ...prev, salesWindowEnd: e.target.value }))}
                          className="rounded border p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                        />
                        {(eventDraft.salesWindowStart || eventDraft.salesWindowEnd) ? (
                          <button type="button" className="text-xs text-slate-400 underline" onClick={() => setEventDraft((prev) => ({ ...prev, salesWindowStart: "", salesWindowEnd: "" }))}>Clear</button>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider" style={{ color: "#9ca3af" }}>Max tickets per email</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="No limit"
                        value={eventDraft.maxTicketsPerEmail}
                        onChange={(e) => setEventDraft((prev) => ({ ...prev, maxTicketsPerEmail: e.target.value }))}
                        className="w-32 rounded border p-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                      />
                      <p className="mt-1 text-xs text-slate-400">Leave blank for no limit.</p>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={saveEventInline}
                  disabled={savingEvent}
                  className="mt-5 w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#2979ff" }}
                >
                  {savingEvent ? eventPrimaryLoadingLabel : eventPrimaryActionLabel}
                </button>
                <FeedbackBanner className="mt-3" kind={eventFb.kind} message={eventFb.message} />
                {isAccessCodeGenerationMode ? (
                  <p className="mt-2 text-center text-xs" style={{ color: "#2979ff" }}>Generate your access code to start sending QR tickets.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="px-6 py-24" style={{ background: "#111827" }}>
          <div className="mx-auto max-w-5xl text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: "#2979ff" }}>Built for everyone</p>
            <h2 className="text-3xl font-black sm:text-4xl" style={{ color: "#f9fafb" }}>Perfect for any event, any size</h2>
            <p className="mx-auto mt-4 max-w-xl" style={{ color: "#9ca3af" }}>From birthday parties to church gatherings — if you need tickets, Connsura has you covered.</p>
            <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { emoji: "🎤", label: "Influencers" },
                { emoji: "🎧", label: "Club Promoters" },
                { emoji: "⛪", label: "Churches" },
                { emoji: "🎓", label: "Schools" },
                { emoji: "🎉", label: "Parties" },
                { emoji: "🏢", label: "Corporate" },
              ].map(({ emoji, label }) => (
                <div key={label} className="flex flex-col items-center gap-3 rounded-2xl p-5 transition-transform hover:-translate-y-1" style={{ background: "#1f2937", border: "1px solid #374151" }}>
                  <div className="text-4xl">{emoji}</div>
                  <p className="text-sm font-semibold" style={{ color: "#f3f4f6" }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-24 text-center" style={{ background: "linear-gradient(135deg, #eff4ff 0%, #fff 60%)" }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-4xl font-black leading-tight sm:text-5xl" style={{ color: "#111827" }}>Ready to run your next event?</h2>
            <p className="mt-5 text-lg" style={{ color: "#6b7280" }}>Join organizers who trust Connsura to handle their tickets.</p>
            <div className="mt-8">
              <button
                type="button"
                onClick={handleGetStarted}
                className="inline-block rounded-2xl px-12 py-4 text-lg font-bold text-white shadow-xl transition-opacity hover:opacity-90"
                style={{ background: "#2979ff" }}
              >
                Get Started &rarr;
              </button>
            </div>
            <p className="mt-4 text-sm font-semibold" style={{ color: "#6b7280" }}>If you don't sell tickets, you pay nothing.</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "#6b7280" }}>You only pay $0.99 per ticket — after it's sold.</p>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-12" style={{ background: "#111827", borderTop: "1px solid #1f2937" }}>
          <div className="mx-auto max-w-5xl flex flex-col gap-10 sm:flex-row sm:justify-between">
            {/* Support */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white">Support</p>
              <ul className="space-y-2">
                <li><a href="/help" className="text-sm text-white hover:underline">Help Center</a></li>
                <li><a href="/contact-support" className="text-sm text-white hover:underline">Contact Support</a></li>
                <li><a href="/contact-support" className="text-sm text-white hover:underline">Report an Issue</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white">Legal</p>
              <ul className="space-y-2">
                <li><a href="/terms" className="text-sm text-white hover:underline">Terms of Service</a></li>
                <li><a href="/privacy" className="text-sm text-white hover:underline">Privacy Policy</a></li>
                <li><a href="/data-payments" className="text-sm text-white hover:underline">Data &amp; Payments</a></li>
              </ul>
            </div>

            {/* Copyright */}
            <div className="sm:text-right">
              <p className="text-sm font-semibold text-white">© 2026 Connsura Technologies, Inc.</p>
              <p className="mt-1 text-xs text-white">All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
      ) : (
      <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      {showLoadDashboard ? (
        <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="w-full max-w-sm py-12">
            <h2 className="text-center text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="mt-2 text-center text-sm text-slate-500">Enter your organizer access code to continue.</p>

            <div className="mt-6">
              <input
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-center font-mono tracking-widest text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Your access code"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") load(); }}
              />
            </div>

            <FeedbackBanner className="mt-3" kind={loadFb.kind} message={loadFb.message} />

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-base font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" aria-hidden="true" />
              ) : null}
              {loading ? "Loading…" : "Continue →"}
            </button>

            <div className="mt-6 flex flex-col items-center gap-3">
              <Link to="/help?recovery=1" className="text-sm font-medium text-red-500 hover:text-red-700">
                Lost your access code?
              </Link>
              <button
                type="button"
                className="text-sm text-slate-400 hover:text-slate-600"
                onClick={handleBackToHome}
              >
                ← Back to home
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Compact app header */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900">
                {summary?.event?.eventName || "Dashboard"}
              </h1>
              {summary?.event?.organizerName ? (
                <p className="truncate text-xs text-slate-500">{summary.event.organizerName}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setShowCodePanel((o) => !o)}
              className="ml-3 flex-shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Account options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>

          {/* Collapsible code panel */}
          {showCodePanel ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Load a different code</p>
              <div className="flex gap-2">
                <input
                  className="w-full rounded border border-slate-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={accessCode || "Your access code"}
                  onKeyDown={(e) => { if (e.key === "Enter") load(); }}
                />
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="flex-shrink-0 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {loading ? "…" : "Load"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {!showLoadDashboard ? <FeedbackBanner className="mt-3" kind={loadFb.kind} message={loadFb.message} /> : null}

      {(!showLoadDashboard || summary) && !showHeroSection ? (
        <div className="mt-4 -mx-4 sm:-mx-6 border-b border-slate-200">
          <div className="flex overflow-x-auto no-scrollbar px-4 sm:px-6">
            {visibleMenus.map((menu) => (
              <button
                key={menu.id}
                type="button"
                onClick={() => { setActiveMenu(menu.id); if (menu.id === "settings") loadNotifications(); }}
                className={`relative flex flex-shrink-0 flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                  activeMenu === menu.id
                    ? "border-b-2 border-indigo-600 text-indigo-600"
                    : "border-b-2 border-transparent text-slate-500"
                }`}
              >
                {TAB_ICONS[menu.id]}
                {menu.label}
                {menu.id === "chat" && chatUnreadTotal > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white">
                    {chatUnreadTotal > 99 ? "99+" : chatUnreadTotal}
                  </span>
                ) : null}
                {menu.id === "requests" && pendingRequestCount > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
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
                  <p className="font-semibold">Start Date:</p>
                  <DateTimeInput
                    value={eventDraft.eventDate}
                    onChange={(v) => setEventDraft((prev) => ({ ...prev, eventDate: v }))}
                    minDate={new Date().toISOString().slice(0, 10)}
                  />
                  <p className="font-semibold">End Date:</p>
                  <DateTimeInput
                    value={eventDraft.eventEndDate}
                    onChange={(v) => setEventDraft((prev) => ({ ...prev, eventEndDate: v }))}
                    minDate={new Date().toISOString().slice(0, 10)}
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
                  <button
                    type="button"
                    onClick={() => setAdvancedSettingsOpen((prev) => !prev)}
                    className="mt-2 flex w-full items-center justify-between rounded border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50"
                  >
                    <span>Advanced Settings</span>
                    <span>{advancedSettingsOpen ? "▲" : "▼"}</span>
                  </button>
                  {advancedSettingsOpen ? (
                    <div className="mt-2 space-y-3 rounded border p-3 text-sm">
                      <div>
                        <p className="font-semibold">Stop selling after:</p>
                        <DateTimeInput
                          value={eventDraft.salesCutoffAt}
                          onChange={(v) => setEventDraft((prev) => ({ ...prev, salesCutoffAt: v }))}
                          minDate={new Date().toISOString().slice(0, 10)}
                        />
                        {eventDraft.salesCutoffAt ? (
                          <button type="button" className="mt-1 text-xs text-slate-400 underline" onClick={() => setEventDraft((prev) => ({ ...prev, salesCutoffAt: "" }))}>Clear</button>
                        ) : null}
                      </div>
                      <div>
                        <p className="font-semibold">Sell tickets from:</p>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={eventDraft.salesWindowStart}
                            onChange={(e) => setEventDraft((prev) => ({ ...prev, salesWindowStart: e.target.value }))}
                            className="rounded border p-1.5 text-sm focus:outline-none"
                          />
                          <span className="text-slate-500">to</span>
                          <input
                            type="time"
                            value={eventDraft.salesWindowEnd}
                            onChange={(e) => setEventDraft((prev) => ({ ...prev, salesWindowEnd: e.target.value }))}
                            className="rounded border p-1.5 text-sm focus:outline-none"
                          />
                          {(eventDraft.salesWindowStart || eventDraft.salesWindowEnd) ? (
                            <button type="button" className="text-xs text-slate-400 underline" onClick={() => setEventDraft((prev) => ({ ...prev, salesWindowStart: "", salesWindowEnd: "" }))}>Clear</button>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold">Max tickets per email:</p>
                        <input
                          type="number"
                          min="1"
                          placeholder="No limit"
                          value={eventDraft.maxTicketsPerEmail}
                          onChange={(e) => setEventDraft((prev) => ({ ...prev, maxTicketsPerEmail: e.target.value }))}
                          className="w-32 rounded border p-1.5 text-sm focus:outline-none"
                        />
                        <p className="mt-1 text-xs text-slate-500">Leave blank for no limit.</p>
                      </div>
                    </div>
                  ) : null}
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
                  {isOrganizerVerified ? (
                    <>
                      <p className="break-all"><span className="font-semibold">Public Event Link:</span> {summary.event.slug ? `${window.location.origin}/e/${summary.event.slug}` : "Not available"}</p>
                      {summary.event.slug ? (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs disabled:opacity-60"
                          onClick={() => { void copyPublicEventLink(); }}
                        >
                          {copiedPublicEventLink ? "Copied" : "Copy"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-xs text-amber-700 rounded border border-amber-300 bg-amber-50 px-2 py-1">
                      <span className="font-semibold">Event not yet published.</span> Verify your email to publish and share your event.
                    </p>
                  )}
                </div>

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
                  initialTicketType={summary.event.ticketType || ""}
                  initialTicketPrice={summary.event.ticketPrice || ""}
                  initialDesignJson={summary.event.designJson || null}
                  canDeleteTicketTypes={tickets.length < 1}
                  onGenerated={handleTicketsGenerated}
                  onDraftChange={applyTicketEditorDraft}
                  onSave={saveTicketEditorDraft}
                  saveLoading={savingTicketDraft}
                />
              </div>
              <FeedbackBanner className="mb-3" kind={ticketFb.kind} message={ticketFb.message} />
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
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold">Sold tickets</p>
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
                        className="px-2 py-1 text-xs"
                        variant="secondary"
                        title="Copy ticket URL"
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
                    <thead className="bg-slate-100"><tr><th className="p-2">Ticket ID</th><th className="p-2">Ticket Type</th><th className="p-2">Buyer</th><th className="p-2">Sold</th><th className="p-2">Status</th><th className="p-2">Scanned At</th><th className="p-2">Cancellations</th><th className="p-2">Copy</th></tr></thead>
                  <tbody>
                    {pagedTickets.map((ticket) => (
                      <tr key={ticket.ticketPublicId} className="border-t">
                        <td className="break-all p-2 font-mono">{ticket.ticketPublicId}</td>
                        <td className="p-2">{ticket.ticketType || summary.event.ticketType || "General"}</td>
                        <td className="p-2">{ticket.buyer || "-"}</td>
                        <td className="p-2">{isTicketSold(ticket) ? "YES" : "NO"}</td>
                        <td className="p-2">{ticket.status}</td>
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
                            className="rounded border px-2 py-1 text-xs"
                            title="Copy ticket URL"
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
                        <td className="p-3 text-slate-500" colSpan={8}>No tickets for selected filters.</td>
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
                  const isRejected = item.status === "REJECTED";
                  const isPending = item.status === "PENDING_VERIFICATION";
                  const isApproving = approvingRequestIds.has(item.id);
                  const isRejecting = rejectingRequestIds.has(item.id);
                  return (
                    <article key={item.id} className="rounded border bg-white p-3 text-sm">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <p><span className="font-semibold">Name:</span> {item.name}</p>
                        <p><span className="font-semibold">Email:</span> {item.email || "-"}</p>
                        {item.duplicateEmailWarning ? (
                          <p className="col-span-2">
                            <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">⚠ Duplicate email</span>
                          </p>
                        ) : null}
                        <p className="col-span-2">
                          <span className="font-semibold">Ticket Types:</span>{" "}
                          {selections.length
                            ? selections.map((selection) => `${selection.ticketType} x${selection.quantity}`).join(", ")
                            : item.ticketType || "-"}
                        </p>
                        <p><span className="font-semibold">Quantity:</span> {item.quantity}</p>
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
                          className={`px-2 py-1 text-xs ${!isPending ? "opacity-70" : ""}`}
                          variant={isApproved ? "success" : isCancelled || isRejected ? "secondary" : "success"}
                          onClick={() => approveRequest(item.id)}
                          loading={isApproving}
                          loadingText="Approving..."
                          disabled={!isPending}
                        >
                          {isCancelled ? "Cancelled" : isRejected ? "Rejected" : isApproved ? "Approved" : "Approve"}
                        </AppButton>
                        {isPending ? (
                          <AppButton
                            className="px-2 py-1 text-xs"
                            variant="danger"
                            onClick={() => rejectRequest(item.id)}
                            loading={isRejecting}
                            loadingText="Rejecting..."
                          >
                            Reject
                          </AppButton>
                        ) : null}
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
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketRequests.map((item) => {
                      const selections = Array.isArray(item.ticketSelections) ? item.ticketSelections : [];
                      const isApproved = item.status === "APPROVED";
                      const isCancelled = item.status === "CANCELLED";
                      const isRejected = item.status === "REJECTED";
                      const isPending = item.status === "PENDING_VERIFICATION";
                      const isApproving = approvingRequestIds.has(item.id);
                      const isRejecting = rejectingRequestIds.has(item.id);
                      return (
                        <tr key={item.id} className="border-t align-top">
                          <td className="p-2 font-semibold">{item.name}</td>
                          <td className="p-2">
                            <p>{item.email || "-"}</p>
                            {item.duplicateEmailWarning ? (
                              <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">⚠ Duplicate email</span>
                            ) : null}
                          </td>
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
                          <td className="p-2">
                            <div className="flex flex-wrap gap-2">
                              <AppButton
                                className={`px-2 py-1 text-xs ${!isPending ? "opacity-70" : ""}`}
                                variant={isApproved ? "success" : isCancelled || isRejected ? "secondary" : "success"}
                                onClick={() => approveRequest(item.id)}
                                loading={isApproving}
                                loadingText="Approving..."
                                disabled={!isPending}
                              >
                                {isCancelled ? "Cancelled" : isRejected ? "Rejected" : isApproved ? "Approved" : "Approve"}
                              </AppButton>
                              {isPending ? (
                                <AppButton
                                  className="px-2 py-1 text-xs"
                                  variant="danger"
                                  onClick={() => rejectRequest(item.id)}
                                  loading={isRejecting}
                                  loadingText="Rejecting..."
                                >
                                  Reject
                                </AppButton>
                              ) : null}
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

          {activeMenu === "settings" ? (
            <>
            <section className="mt-4 rounded border p-4">
              <button type="button" className="flex w-full items-center justify-between" onClick={() => setPromotersOpen((o) => !o)}>
                <p className="text-sm font-semibold">Promoters</p>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-400 transition-transform duration-150 ${promotersOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {promotersOpen ? (
              <>
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
              </>
              ) : null}
            </section>

            <section className="mt-4 rounded border p-4">
              <button type="button" className="flex w-full items-center justify-between" onClick={() => setNotificationsOpen((o) => !o)}>
                <p className="text-sm font-semibold">Notifications</p>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-400 transition-transform duration-150 ${notificationsOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {notificationsOpen ? (
              <>
              <p className="mt-1 text-xs text-slate-500">
                Verify your email below to receive notifications when customers send a ticket request,
                reply to a message, or when the admin contacts you.
              </p>

              {/* Email verification */}
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-slate-700">Notification email</label>
                {notifDraft.organizerEmail && !notifEmailChanging ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-green-50 px-2 py-1 text-sm font-medium text-green-800">{notifDraft.organizerEmail} ✓</span>
                    <button type="button" className="text-xs text-slate-500 underline" onClick={() => { setNotifEmailChanging(true); setNotifOtpSent(false); setNotifEmailFb("", ""); }}>
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        className="w-full rounded border p-2 text-sm"
                        type="email"
                        placeholder="you@example.com"
                        value={notifEmailInput}
                        onChange={(e) => { setNotifEmailInput(e.target.value); setNotifOtpSent(false); }}
                      />
                      <AppButton onClick={sendNotifEmailOtp} loading={sendingNotifOtp} loadingText="Sending...">
                        Send Code
                      </AppButton>
                    </div>
                    {notifOtpSent ? (
                      <div className="flex gap-2">
                        <input
                          className="w-full rounded border p-2 text-sm tracking-widest"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6-digit code"
                          value={notifOtpInput}
                          onChange={(e) => setNotifOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        />
                        <AppButton onClick={verifyNotifEmailOtp} loading={verifyingNotifOtp} loadingText="Verifying...">
                          Verify
                        </AppButton>
                      </div>
                    ) : null}
                  </div>
                )}
                <FeedbackBanner className="mt-2" kind={notifEmailFb.kind} message={notifEmailFb.message} />
              </div>

              {/* Toggle preferences */}
              <div className="mt-4 space-y-2">
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
              <AppButton className="mt-4" onClick={saveNotifications} loading={savingNotif} loadingText="Saving...">
                Save Preferences
              </AppButton>
              <FeedbackBanner className="mt-2" kind={notifFb.kind} message={notifFb.message} />
              </>
              ) : null}
            </section>
            </>
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

                      <div>
                        <p className="font-medium">Refund evidence</p>
                        <input className="mt-2 w-full rounded border p-2 text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCancelEvidenceFileChange} />
                        {cancelModal.evidenceName ? <p className="mt-1 text-xs text-slate-600">{cancelModal.evidenceName}</p> : null}
                        {cancelModal.evidenceImageDataUrl ? (
                          <button type="button" className="mt-2 inline-block" onClick={() => openEvidenceImage(cancelModal.evidenceImageDataUrl)}>
                            <img src={cancelModal.evidenceImageDataUrl} alt="Refund evidence preview" className="h-16 w-16 rounded border object-cover" />
                          </button>
                        ) : null}
                      </div>
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
            <p className="font-semibold">Start Date:</p>
            <DateTimeInput
              value={eventDraft.eventDate}
              onChange={(v) => setEventDraft((prev) => ({ ...prev, eventDate: v }))}
              minDate={new Date().toISOString().slice(0, 10)}
            />
            <p className="font-semibold">End Date:</p>
            <DateTimeInput
              value={eventDraft.eventEndDate}
              onChange={(v) => setEventDraft((prev) => ({ ...prev, eventEndDate: v }))}
              minDate={new Date().toISOString().slice(0, 10)}
            />
            <p className="font-semibold">Location:</p>
            <input
              className="w-full rounded border p-2 text-sm"
              value={eventDraft.eventAddress}
              onChange={(e) => setEventDraft((prev) => ({ ...prev, eventAddress: e.target.value }))}
            />
          </div>
          <button
            type="button"
            onClick={() => setAdvancedSettingsOpen((prev) => !prev)}
            className="mt-3 flex w-full items-center justify-between rounded border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-50"
          >
            <span>Advanced Settings</span>
            <span>{advancedSettingsOpen ? "▲" : "▼"}</span>
          </button>
          {advancedSettingsOpen ? (
            <div className="mt-2 space-y-3 rounded border p-3 text-sm">
              <div>
                <p className="font-semibold">Stop selling after:</p>
                <DateTimeInput
                  value={eventDraft.salesCutoffAt}
                  onChange={(v) => setEventDraft((prev) => ({ ...prev, salesCutoffAt: v }))}
                  minDate={new Date().toISOString().slice(0, 10)}
                />
                {eventDraft.salesCutoffAt ? (
                  <button type="button" className="mt-1 text-xs text-slate-400 underline" onClick={() => setEventDraft((prev) => ({ ...prev, salesCutoffAt: "" }))}>Clear</button>
                ) : null}
              </div>
              <div>
                <p className="font-semibold">Sell tickets from:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={eventDraft.salesWindowStart}
                    onChange={(e) => setEventDraft((prev) => ({ ...prev, salesWindowStart: e.target.value }))}
                    className="rounded border p-1.5 text-sm focus:outline-none"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="time"
                    value={eventDraft.salesWindowEnd}
                    onChange={(e) => setEventDraft((prev) => ({ ...prev, salesWindowEnd: e.target.value }))}
                    className="rounded border p-1.5 text-sm focus:outline-none"
                  />
                  {(eventDraft.salesWindowStart || eventDraft.salesWindowEnd) ? (
                    <button type="button" className="text-xs text-slate-400 underline" onClick={() => setEventDraft((prev) => ({ ...prev, salesWindowStart: "", salesWindowEnd: "" }))}>Clear</button>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="font-semibold">Max tickets per email:</p>
                <input
                  type="number"
                  min="1"
                  placeholder="No limit"
                  value={eventDraft.maxTicketsPerEmail}
                  onChange={(e) => setEventDraft((prev) => ({ ...prev, maxTicketsPerEmail: e.target.value }))}
                  className="w-32 rounded border p-1.5 text-sm focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">Leave blank for no limit.</p>
              </div>
            </div>
          ) : null}
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

      {verifyGateModal.open ? (
        <ModalOverlay className="z-50 bg-black/50">
          <section className="w-full max-w-sm rounded border bg-white p-5 shadow-xl">
            {gateMode === "recovery" ? (
              <>
                <div className="flex items-start justify-between mb-3">
                  <p className="font-semibold text-gray-900">You already have an organizer account</p>
                  <button type="button" onClick={closeVerifyGate} className="ml-3 text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  We&apos;ve sent your organizer access code to <span className="font-medium">{gateEmailInput}</span>. Enter it below to switch to your existing account.
                </p>
                <FeedbackBanner kind={recoveryFb.kind} message={recoveryFb.message} />
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Your organizer access code</label>
                    <input
                      type="text"
                      className="w-full rounded border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={recoveryCodeInput}
                      onChange={(e) => setRecoveryCodeInput(e.target.value)}
                      placeholder="Paste your code here"
                    />
                  </div>
                  <AppButton type="button" variant="primary" className="w-full" onClick={loadAccount} loading={loadingRecovery} loadingText="Loading...">
                    Load Account
                  </AppButton>
                  <button type="button" className="w-full text-xs text-blue-600 underline" onClick={() => { setGateMode("otp"); setGateOtpSent(false); setGateOtpInput(""); setGateEmailFb("", ""); }}>
                    Use a different email
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">Verify your email to publish</p>
                    <p className="text-xs text-gray-500 mt-0.5">Your event will go live for ticket buyers once verified.</p>
                  </div>
                  <button type="button" onClick={closeVerifyGate} className="ml-3 text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                </div>
                <FeedbackBanner kind={gateEmailFb.kind} message={gateEmailFb.message} />
                <div className="mt-2 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email address</label>
                    <input
                      type="email"
                      className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={gateEmailInput}
                      onChange={(e) => setGateEmailInput(e.target.value)}
                      placeholder="your@email.com"
                      disabled={gateOtpSent}
                    />
                  </div>
                  {!gateOtpSent ? (
                    <AppButton type="button" variant="primary" className="w-full" onClick={sendGateOtp} loading={sendingGateOtp} loadingText="Sending...">
                      Send verification code
                    </AppButton>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Enter the 6-digit code from your email</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          className="w-full rounded border px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400"
                          value={gateOtpInput}
                          onChange={(e) => setGateOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="123456"
                        />
                      </div>
                      <AppButton type="button" variant="primary" className="w-full" onClick={verifyGateOtp} loading={verifyingGateOtp} loadingText="Verifying...">
                        Verify &amp; publish event
                      </AppButton>
                      <button type="button" className="w-full text-xs text-blue-600 underline mt-1" onClick={() => { setGateOtpSent(false); setGateOtpInput(""); setGateEmailFb("", ""); }}>
                        Use a different email
                      </button>
                    </>
                  )}
                  <p className="text-xs text-gray-400">We&apos;ll also enable email notifications so you&apos;re alerted when someone requests a ticket.</p>
                </div>
              </>
            )}
          </section>
        </ModalOverlay>
      ) : null}

      {pendingMerge ? (
        <ModalOverlay className="z-50 bg-black/50">
          <section className="w-full max-w-sm rounded border bg-white p-5 shadow-xl">
            <p className="font-semibold text-gray-900 mb-1">You also started setting up a new event</p>
            <div className="my-3 rounded border bg-slate-50 p-3 text-sm space-y-1">
              <p className="font-medium">{pendingMerge.summary?.event?.eventName || "Unnamed event"}</p>
              <p className="text-gray-500">{pendingMerge.summary?.event?.eventDate ? new Date(pendingMerge.summary.event.eventDate).toLocaleDateString() : ""}{pendingMerge.summary?.event?.eventAddress ? ` — ${pendingMerge.summary.event.eventAddress}` : ""}</p>
              {pendingMerge.summary?.totalTickets > 0 && (
                <p className="text-gray-500">{pendingMerge.summary.totalTickets} ticket{pendingMerge.summary.totalTickets !== 1 ? "s" : ""} generated</p>
              )}
            </div>
            <p className="text-sm text-gray-700 mb-4">Add this event to your existing account?</p>
            <div className="flex gap-3">
              <AppButton
                type="button"
                variant="primary"
                className="flex-1"
                onClick={async () => {
                  if (mergingEvent) return;
                  setMergingEvent(true);
                  try {
                    await api.post(`/events/by-code/${encodeURIComponent(accessCode)}/merge-event`, { orphanAccessCode: pendingMerge.orphanAccessCode });
                    setPendingMerge(null);
                    await loadDashboard(accessCode);
                  } catch (err) {
                    alert(err.response?.data?.error || "Could not merge event. Try again.");
                  } finally {
                    setMergingEvent(false);
                  }
                }}
                loading={mergingEvent}
                loadingText="Adding..."
              >
                Yes, add it
              </AppButton>
              <button
                type="button"
                disabled={mergingEvent}
                className="flex-1 rounded border px-3 py-2 text-sm text-gray-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setPendingMerge(null)}
              >
                No, discard it
              </button>
            </div>
          </section>
        </ModalOverlay>
      ) : null}
      {summary?.event?.slug ? (
        <button
          type="button"
          onClick={shareEvent}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-indigo-500 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share Event
        </button>
      ) : null}
    </main>
      )}
    </>
  );
}
