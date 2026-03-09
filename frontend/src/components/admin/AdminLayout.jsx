import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import AppButton from "../ui/AppButton";
import { adminApi, clearAdminKey, getAdminKey, setAdminKey } from "../../lib/adminApi";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/events", label: "Events" },
  { to: "/admin/tickets", label: "Tickets" },
  { to: "/admin/deliveries", label: "Deliveries" },
  { to: "/admin/scans", label: "Scans" },
  { to: "/admin/client-dash-tokens", label: "Client Dash Tokens" },
  { to: "/admin/settings", label: "Settings" },
  { to: "/admin/audit-log", label: "Audit Log" },
];

function NavItems({ onNavigate }) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `block rounded px-3 py-2 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [keyInput, setKeyInput] = useState(getAdminKey());

  const pageTitle = useMemo(() => {
    const item = NAV_ITEMS.find((entry) => location.pathname.startsWith(entry.to));
    return item?.label || "Admin";
  }, [location.pathname]);

  const verifyKey = async (keyValue) => {
    setAdminKey(keyValue);
    try {
      await adminApi.get("/settings");
      setAuthReady(true);
      setAuthError("");
      return true;
    } catch (error) {
      clearAdminKey();
      setAuthReady(false);
      setAuthError(error.response?.data?.error || "Invalid admin key.");
      return false;
    }
  };

  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      const existingKey = getAdminKey();
      if (!existingKey) {
        if (alive) {
          setAuthChecking(false);
          setAuthReady(false);
        }
        return;
      }

      const ok = await verifyKey(existingKey);
      if (alive) {
        setAuthChecking(false);
        setAuthReady(ok);
      }
    };

    bootstrap();
    return () => {
      alive = false;
    };
  }, []);

  if (authChecking) {
    return <main className="mx-auto max-w-4xl px-4 py-6">Checking admin access...</main>;
  }

  if (!authReady) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-8 sm:px-6">
        <div className="rounded border bg-white p-4 sm:p-5">
          <h1 className="text-xl font-bold">Admin Access</h1>
          <p className="mt-2 text-sm text-slate-600">Enter your internal admin key to continue.</p>
          <input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            className="mt-4 w-full rounded border p-2"
            placeholder="Admin key"
          />
          {authError ? <p className="mt-2 text-sm text-red-600">{authError}</p> : null}
          <AppButton
            className="mt-4"
            onClick={async () => {
              const ok = await verifyKey(keyInput);
              if (ok) navigate("/admin/dashboard");
            }}
          >
            Unlock Admin
          </AppButton>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl gap-0 lg:gap-6">
        <aside className="hidden w-64 shrink-0 border-r bg-white p-4 lg:block">
          <Link to="/admin/dashboard" className="text-lg font-bold">System Admin</Link>
          <p className="mt-1 text-xs text-slate-500">QR Tickets Internal Panel</p>
          <div className="mt-4">
            <NavItems />
          </div>
          <AppButton
            className="mt-6"
            variant="secondary"
            onClick={() => {
              clearAdminKey();
              setAuthReady(false);
              setAuthError("");
            }}
          >
            Lock Admin
          </AppButton>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:hidden">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">Admin</p>
                <h1 className="text-lg font-bold">{pageTitle}</h1>
              </div>
              <AppButton variant="secondary" onClick={() => setDrawerOpen((prev) => !prev)}>
                {drawerOpen ? "Close" : "Menu"}
              </AppButton>
            </div>
            {drawerOpen ? (
              <div className="mt-3 rounded border bg-white p-2">
                <NavItems onNavigate={() => setDrawerOpen(false)} />
              </div>
            ) : null}
          </header>

          <main className="w-full px-4 py-4 sm:px-6 sm:py-6">
            <div className="hidden items-center justify-between pb-4 lg:flex">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">System Admin</p>
                <h1 className="text-2xl font-bold">{pageTitle}</h1>
              </div>
              <AppButton
                variant="secondary"
                onClick={() => {
                  clearAdminKey();
                  setAuthReady(false);
                  setAuthError("");
                }}
              >
                Lock Admin
              </AppButton>
            </div>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
