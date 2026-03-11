import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import SearchInput from "../../components/admin/SearchInput";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import StatusBadge from "../../components/admin/StatusBadge";
import PaginationControls from "../../components/admin/PaginationControls";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminOrganizersPage() {
  const PAGE_SIZE = 5;
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [expandedOrganizerCode, setExpandedOrganizerCode] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/organizers", {
        params: { search: search.trim() || undefined },
      });
      setItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setPage(1);
      setExpandedOrganizerCode("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load organizers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visibleItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3">
      <div className="rounded border bg-white p-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search organizerAccessCode, eventName, or accessCode"
        />
        <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={load}>Search</button>
      </div>

      {loading ? <LoadingState label="Loading organizers..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !items.length ? <EmptyState label="No organizers found." /> : null}

      {!loading && !error && items.length ? (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Organizer Access Code</th>
                  <th className="px-3 py-2">Events</th>
                  <th className="px-3 py-2">Tickets</th>
                  <th className="px-3 py-2">Used</th>
                  <th className="px-3 py-2">Invalidated</th>
                  <th className="px-3 py-2">Requests</th>
                  <th className="px-3 py-2">Latest Event</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((organizer) => {
                  const isExpanded = expandedOrganizerCode === organizer.organizerAccessCode;
                  return (
                    <Fragment key={organizer.organizerAccessCode}>
                      <tr className="border-t align-top">
                        <td className="px-3 py-2 font-mono">{organizer.organizerAccessCode}</td>
                        <td className="px-3 py-2">{organizer.eventsTotal}</td>
                        <td className="px-3 py-2">{organizer.ticketsTotal}</td>
                        <td className="px-3 py-2">{organizer.ticketsUsed}</td>
                        <td className="px-3 py-2">{organizer.ticketsInvalidated}</td>
                        <td className="px-3 py-2">{organizer.ticketRequestsTotal}</td>
                        <td className="px-3 py-2">{formatDate(organizer.latestEventCreatedAt)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded border px-2 py-1 text-xs"
                              onClick={() => navigator.clipboard.writeText(organizer.organizerAccessCode)}
                            >
                              Copy
                            </button>
                            <button
                              className="rounded border px-2 py-1 text-xs"
                              onClick={() => setExpandedOrganizerCode(isExpanded ? "" : organizer.organizerAccessCode)}
                            >
                              {isExpanded ? "Hide Events" : "View Events"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-t bg-slate-50">
                          <td className="px-3 py-3" colSpan={8}>
                            {Array.isArray(organizer.events) && organizer.events.length ? (
                              <div className="overflow-x-auto rounded border bg-white">
                                <table className="min-w-full text-left text-xs">
                                  <thead className="bg-slate-100 uppercase tracking-wide text-slate-600">
                                    <tr>
                                      <th className="px-2 py-2">Event</th>
                                      <th className="px-2 py-2">Access Code</th>
                                      <th className="px-2 py-2">Date</th>
                                      <th className="px-2 py-2">Status</th>
                                      <th className="px-2 py-2">Tickets</th>
                                      <th className="px-2 py-2">Used</th>
                                      <th className="px-2 py-2">Invalidated</th>
                                      <th className="px-2 py-2">Requests</th>
                                      <th className="px-2 py-2">Links</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {organizer.events.map((event) => (
                                      <tr key={event.eventId} className="border-t">
                                        <td className="px-2 py-2">
                                          <p className="font-semibold">{event.eventName}</p>
                                          <p className="text-slate-500">{event.location || "-"}</p>
                                        </td>
                                        <td className="px-2 py-2 font-mono">{event.accessCode}</td>
                                        <td className="px-2 py-2">{formatDate(event.eventDate)}</td>
                                        <td className="px-2 py-2"><StatusBadge value={event.status} /></td>
                                        <td className="px-2 py-2">{event.ticketsTotal}</td>
                                        <td className="px-2 py-2">{event.ticketsUsed}</td>
                                        <td className="px-2 py-2">{event.ticketsInvalidated}</td>
                                        <td className="px-2 py-2">{event.ticketRequestsTotal}</td>
                                        <td className="px-2 py-2">
                                          <div className="flex flex-wrap gap-2">
                                            <Link className="rounded border px-2 py-1" to={`/admin/events/${event.eventId}`}>Event</Link>
                                            <Link className="rounded border px-2 py-1" to={`/admin/tickets?eventId=${encodeURIComponent(event.eventId)}`}>Tickets</Link>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">No events mapped to this organizer access code.</p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(items.length / PAGE_SIZE))}
            totalItems={items.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(items.length / PAGE_SIZE)), prev + 1))}
          />
        </div>
      ) : null}
    </section>
  );
}
