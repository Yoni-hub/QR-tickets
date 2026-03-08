import { Link, Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import Demo from "./pages/Demo";
import TicketVerify from "./pages/TicketVerify";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminEventsPage from "./pages/admin/AdminEventsPage";
import AdminEventDetailPage from "./pages/admin/AdminEventDetailPage";
import AdminTicketsPage from "./pages/admin/AdminTicketsPage";
import AdminDeliveriesPage from "./pages/admin/AdminDeliveriesPage";
import AdminScansPage from "./pages/admin/AdminScansPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminAuditLogPage from "./pages/admin/AdminAuditLogPage";

export default function App() {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-slate-50 text-slate-900">
      <nav className="border-b bg-white px-4 py-3">
        <ul className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <li><Link to="/">Home</Link></li>
          <li><Link to="/dashboard">Dashboard</Link></li>
          <li><Link to="/scanner">Scanner</Link></li>
          <li><Link to="/demo">Demo</Link></li>
          <li><Link to="/admin/dashboard">Admin</Link></li>
        </ul>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/t/:ticketPublicId" element={<TicketVerify />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="events/:eventId" element={<AdminEventDetailPage />} />
          <Route path="tickets" element={<AdminTicketsPage />} />
          <Route path="deliveries" element={<AdminDeliveriesPage />} />
          <Route path="scans" element={<AdminScansPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="audit-log" element={<AdminAuditLogPage />} />
        </Route>
      </Routes>
    </div>
  );
}