import { useMemo, useState } from "react";
import ChatInboxLayout from "../../features/chat/ChatInboxLayout";
import { adminChatApi } from "../../features/chat/chatApi";
import { adminApi, getAdminKey } from "../../lib/adminApi";
import AppButton from "../../components/ui/AppButton";

export default function AdminSupportPage() {
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [organizerAccessCode, setOrganizerAccessCode] = useState("");
  const [clientAccessToken, setClientAccessToken] = useState("");

  // Organizer lookup for recovery requests
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState(null); // null = not searched yet
  const [lookupLoading, setLookupLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState("");

  const listParams = useMemo(
    () => ({
      status: statusFilter === "ALL" ? undefined : statusFilter,
      conversationType: typeFilter || undefined,
      q: query || undefined,
    }),
    [statusFilter, typeFilter, query],
  );

  const quickStarts = useMemo(() => {
    const items = [];
    if (organizerAccessCode.trim()) {
      items.push({
        label: "Start Organizer/Admin",
        payload: { conversationType: "ORGANIZER_ADMIN", organizerAccessCode: organizerAccessCode.trim().toUpperCase() },
      });
    }
    if (clientAccessToken.trim()) {
      items.push({
        label: "Start Admin/Client",
        payload: { conversationType: "ADMIN_CLIENT", clientAccessToken: clientAccessToken.trim() },
      });
    }
    return items;
  }, [organizerAccessCode, clientAccessToken]);

  const handleLookup = async () => {
    const q = lookupQuery.trim();
    if (!q) return;
    setLookupLoading(true);
    setLookupResults(null);
    try {
      const res = await adminApi.get(`/organizers?search=${encodeURIComponent(q)}&limit=10`);
      setLookupResults(res.data?.items || []);
    } catch {
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(""), 2000);
    });
  };

  return (
    <section className="space-y-4">
      <div className="rounded border bg-white p-4">
        <h2 className="text-xl font-bold">Chat Inbox</h2>
        <p className="mt-1 text-sm text-slate-600">Unified pairwise chat inbox for admin with organizer/client conversations.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select className="rounded border p-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ALL">All</option>
          </select>
          <select className="rounded border p-2 text-sm" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All Types</option>
            <option value="ORGANIZER_ADMIN">Organizer/Admin</option>
            <option value="ORGANIZER_CLIENT">Organizer/Client</option>
            <option value="ADMIN_CLIENT">Admin/Client</option>
          </select>
          <input
            className="min-w-[220px] flex-1 rounded border p-2 text-sm"
            placeholder="Search subject, token, access code..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            className="rounded border p-2 text-sm uppercase"
            placeholder="Organizer access code"
            value={organizerAccessCode}
            onChange={(event) => setOrganizerAccessCode(event.target.value)}
          />
          <input
            className="rounded border p-2 text-sm"
            placeholder="Client access token"
            value={clientAccessToken}
            onChange={(event) => setClientAccessToken(event.target.value)}
          />
        </div>
      </div>

      <div className="rounded border bg-amber-50 p-4">
        <h3 className="font-semibold text-amber-900">Organizer Lookup — Access Code Recovery</h3>
        <p className="mt-1 text-xs text-amber-800">
          Use this tool to look up an organizer's access code when handling a recovery request.
          Only share the code via the private support chat — never by email or in any public channel.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[220px] flex-1 rounded border p-2 text-sm"
            placeholder="Search by organizer name or event name..."
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          />
          <AppButton variant="primary" onClick={handleLookup} loading={lookupLoading} loadingText="Searching...">
            Search
          </AppButton>
        </div>
        {lookupResults !== null ? (
          <div className="mt-3">
            {lookupResults.length === 0 ? (
              <p className="text-sm text-slate-500">No organizers found.</p>
            ) : (
              <div className="space-y-2">
                {lookupResults.map((row) => (
                  <div key={row.id} className="rounded border bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{row.organizerName || row.organizerAccessCode}</p>
                        <p className="text-slate-500">{row.eventName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Tickets: {row._count?.tickets ?? 0} &middot; Requests: {row._count?.ticketRequests ?? 0}
                          {row.adminStatus && row.adminStatus !== "ACTIVE" ? ` · Status: ${row.adminStatus}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs">{row.organizerAccessCode}</code>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                          onClick={() => handleCopyCode(row.organizerAccessCode)}
                        >
                          {copiedCode === row.organizerAccessCode ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <ChatInboxLayout
        title="Admin Chat"
        actorType="ADMIN"
        api={adminChatApi}
        listParams={listParams}
        quickStarts={quickStarts}
        socketCredentials={{ adminKey: getAdminKey() }}
        showAdminStatusActions
      />
    </section>
  );
}
