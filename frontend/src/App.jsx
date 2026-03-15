import { useEffect } from "react";
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
import AdminDeliveriesPage from "./pages/admin/AdminDeliveriesPage";
import AdminScansPage from "./pages/admin/AdminScansPage";
import AdminOrganizersPage from "./pages/admin/AdminOrganizersPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminAuditLogPage from "./pages/admin/AdminAuditLogPage";
import AdminClientDashTokensPage from "./pages/admin/AdminClientDashTokensPage";
import HelpPage from "./pages/HelpPage";
import AdminSupportPage from "./pages/admin/AdminSupportPage";

export default function App() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isEmbedPreview = searchParams.get("embed") === "1" && location.pathname.startsWith("/e/");

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

  return (
      <div className="min-h-screen w-full overflow-x-clip bg-slate-50 text-slate-900">
      {!isEmbedPreview ? (
        <nav className="border-b bg-white px-4 py-3">
          <ul className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <li><Link to="/dashboard">Dashboard</Link></li>
            <li><Link to="/scanner">Scanner</Link></li>
            <li><Link to="/help">Help</Link></li>
            <li><Link to="/admin/dashboard">Admin</Link></li>
          </ul>
        </nav>
      ) : null}
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/ticket-requests" element={<DashboardTicketRequestsPage />} />
        <Route path="/dashboard/promoters" element={<DashboardPromotersPage />} />
        <Route path="/dashboard/promoters/:id" element={<DashboardPromoterDetailPage />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/help" element={<HelpPage />} />
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
          <Route path="deliveries" element={<AdminDeliveriesPage />} />
          <Route path="scans" element={<AdminScansPage />} />
          <Route path="organizers" element={<AdminOrganizersPage />} />
          <Route path="client-dash-tokens" element={<AdminClientDashTokensPage />} />
          <Route path="support" element={<AdminSupportPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit-log" element={<AdminAuditLogPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}
