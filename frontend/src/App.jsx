import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import TicketVerify from "./pages/TicketVerify";
import PublicEventPage from "./pages/PublicEventPage";
import PublicEventConfirmPage from "./pages/PublicEventConfirmPage";
import ClientDashboardPage from "./pages/ClientDashboardPage";
import DashboardTicketRequestsPage from "./pages/DashboardTicketRequests";
import DashboardPromotersPage from "./pages/DashboardPromoters";
import DashboardPromoterDetailPage from "./pages/DashboardPromoterDetail";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminEventsPage from "./pages/admin/AdminEventsPage";
import AdminEventDetailPage from "./pages/admin/AdminEventDetailPage";
import AdminTicketsPage from "./pages/admin/AdminTicketsPage";
import AdminScansPage from "./pages/admin/AdminScansPage";
import AdminOrganizersPage from "./pages/admin/AdminOrganizersPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminAuditLogPage from "./pages/admin/AdminAuditLogPage";
import AdminClientDashTokensPage from "./pages/admin/AdminClientDashTokensPage";
import HelpPage from "./pages/HelpPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import DataPaymentsPage from "./pages/DataPaymentsPage";
import ContactSupportPage from "./pages/ContactSupportPage";
import AdminSupportPage from "./pages/admin/AdminSupportPage";

export default function App() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEmbedPreview = searchParams.get("embed") === "1" && location.pathname.startsWith("/e/");
  const isAdminPage = location.pathname.startsWith("/admin");

  useEffect(() => {
    const timerByElement = new WeakMap();
    const activeTimers = new Set();

    const handleDocumentClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const clickable = target.closest("button, a");
      if (!clickable) return;
      if (clickable instanceof HTMLButtonElement && clickable.disabled) return;

      const existingTimer = timerByElement.get(clickable);
      if (existingTimer) {
        clearTimeout(existingTimer);
        activeTimers.delete(existingTimer);
      }

      const clickedClass = clickable instanceof HTMLAnchorElement ? "link-clicked" : "btn-clicked";
      clickable.classList.add(clickedClass);
      const timeoutId = setTimeout(() => {
        clickable.classList.remove(clickedClass);
        timerByElement.delete(clickable);
        activeTimers.delete(timeoutId);
      }, 700);

      timerByElement.set(clickable, timeoutId);
      activeTimers.add(timeoutId);
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      for (const timeoutId of activeTimers) {
        clearTimeout(timeoutId);
      }
      activeTimers.clear();
    };
  }, []);


  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
      <div className="min-h-screen w-full overflow-x-clip bg-slate-50 text-slate-900">
      {!isEmbedPreview && !isAdminPage ? (
        <nav className="sticky top-0 z-50 bg-white border-b border-gray-100">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="flex h-20 items-center justify-between">

              {/* Logo — left on both desktop and mobile */}
              <Link to="/" onClick={closeMenu} className="flex-shrink-0 -ml-14 sm:-ml-18">
                <img src="/ticket-logo1.png" alt="QR Tickets" className="h-40 w-auto" />
              </Link>

              {/* Hamburger — mobile only, right */}
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="relative z-50 md:hidden flex flex-col justify-center gap-1.5 p-2"
                aria-label="Toggle menu"
              >
                <span className={`block h-0.5 w-6 bg-slate-800 transition-transform duration-200 ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
                <span className={`block h-0.5 w-6 bg-slate-800 transition-opacity duration-200 ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`block h-0.5 w-6 bg-slate-800 transition-transform duration-200 ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
              </button>

              {/* Desktop nav links — right side, hidden on mobile */}
              <ul className="hidden md:flex items-center gap-8 text-sm font-semibold">
                <li><Link to="/dashboard" className="text-slate-700 transition-colors hover:text-indigo-600">Organizer</Link></li>
                <li><Link to="/client" className="text-slate-700 transition-colors hover:text-indigo-600">Customer</Link></li>
                <li><Link to="/scanner" className="text-slate-700 transition-colors hover:text-indigo-600">Scanner</Link></li>
                <li><Link to="/help" className="text-slate-700 transition-colors hover:text-indigo-600">Help</Link></li>
              </ul>
            </div>
          </div>

          {/* Backdrop — darkens page, click to close */}
          <div
            className={`fixed inset-0 z-40 transition-opacity duration-300 md:hidden ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
            onClick={closeMenu}
            aria-hidden="true"
          />

          {/* Slide-in panel from right */}
          <div
            className={`fixed top-0 right-0 z-50 w-64 bg-white shadow-2xl transition-transform duration-300 md:hidden ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div>
                <p className="text-2xl font-bold text-slate-900">Connsura</p>
                <p className="text-sm text-blue-600">QR Tickets</p>
              </div>
              <button type="button" onClick={closeMenu} className="p-1 text-slate-500 hover:text-slate-800" aria-label="Close menu">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul className="flex flex-col gap-2 p-4 text-sm font-semibold">
              <li><Link to="/dashboard" onClick={closeMenu} className="block rounded-lg bg-slate-100 px-3 py-2.5 text-slate-700 hover:bg-slate-200 hover:text-indigo-600">Organizer</Link></li>
              <li><Link to="/client" onClick={closeMenu} className="block rounded-lg bg-slate-100 px-3 py-2.5 text-slate-700 hover:bg-slate-200 hover:text-indigo-600">Customer</Link></li>
              <li><Link to="/scanner" onClick={closeMenu} className="block rounded-lg bg-slate-100 px-3 py-2.5 text-slate-700 hover:bg-slate-200 hover:text-indigo-600">Scanner</Link></li>
              <li><Link to="/help" onClick={closeMenu} className="block rounded-lg bg-slate-100 px-3 py-2.5 text-slate-700 hover:bg-slate-200 hover:text-indigo-600">Help</Link></li>
            </ul>
          </div>
        </nav>
      ) : null}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/ticket-requests" element={<DashboardTicketRequestsPage />} />
        <Route path="/dashboard/promoters" element={<DashboardPromotersPage />} />
        <Route path="/dashboard/promoters/:id" element={<DashboardPromoterDetailPage />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/data-payments" element={<DataPaymentsPage />} />
        <Route path="/contact-support" element={<ContactSupportPage />} />
        <Route path="/e/:eventSlug" element={<PublicEventPage />} />
        <Route path="/e/:eventSlug/confirm" element={<PublicEventConfirmPage />} />
        <Route path="/client" element={<ClientDashboardPage />} />
        <Route path="/client/:clientAccessToken" element={<ClientDashboardPage />} />
        <Route path="/t/:ticketPublicId" element={<TicketVerify />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="events/:eventId" element={<AdminEventDetailPage />} />
          <Route path="tickets" element={<AdminTicketsPage />} />
          <Route path="scans" element={<AdminScansPage />} />
          <Route path="organizers" element={<AdminOrganizersPage />} />
          <Route path="client-dash-tokens" element={<AdminClientDashTokensPage />} />
          <Route path="support" element={<AdminSupportPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit-log" element={<AdminAuditLogPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
