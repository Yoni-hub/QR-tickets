import { useMemo, useState } from "react";
import ChatInboxLayout from "../../features/chat/ChatInboxLayout";
import { adminChatApi } from "../../features/chat/chatApi";

export default function AdminSupportPage() {
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [organizerAccessCode, setOrganizerAccessCode] = useState("");
  const [clientAccessToken, setClientAccessToken] = useState("");

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

      <ChatInboxLayout
        title="Admin Chat"
        actorType="ADMIN"
        api={adminChatApi}
        listParams={listParams}
        quickStarts={quickStarts}
        showAdminStatusActions
      />
    </section>
  );
}
