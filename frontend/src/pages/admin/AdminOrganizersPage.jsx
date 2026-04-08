import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import SearchInput from "../../components/admin/SearchInput";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import PaginationControls from "../../components/admin/PaginationControls";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminOrganizersPage() {
  const PAGE_SIZE = 20;
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [selectedEventByOrganizer, setSelectedEventByOrganizer] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminApi.get("/organizers", {
        params: { search: search.trim() || undefined },
      });
      const nextItems = Array.isArray(response.data?.items) ? response.data.items : [];
      const nextSelections = {};
      for (const organizer of nextItems) {
        nextSelections[organizer.organizerAccessCode] = organizer?.events?.[0]?.eventId || "";
      }
      setItems(nextItems);
      setSelectedEventByOrganizer(nextSelections);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load organizers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const organizerRows = useMemo(() => {
    return items.map((organizer) => {
      const events = Array.isArray(organizer.events) ? organizer.events : [];
      const selectedEventId = selectedEventByOrganizer[organizer.organizerAccessCode] || events[0]?.eventId || "";
      const selectedEvent = events.find((event) => event.eventId === selectedEventId) || events[0] || null;
      return {
        organizerAccessCode: organizer.organizerAccessCode || "-",
        organizerName: organizer.organizerName || "-",
        organizerEmail: organizer.organizerEmail || "-",
        events,
        selectedEventId,
        selectedEvent,
      };
    });
  }, [items, selectedEventByOrganizer]);

  const pagedRows = organizerRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3">
      <div className="rounded border bg-white p-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search organizer access code, organizer name, event name"
        />
        <button className="mt-2 rounded border px-3 py-1 text-sm" onClick={load}>
          Search
        </button>
      </div>

      {loading ? <LoadingState label="Loading organizers..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !organizerRows.length ? <EmptyState label="No organizer rows found." /> : null}

      {!loading && !error && organizerRows.length ? (
        <>
          <div className="space-y-2 md:hidden">
            {pagedRows.map((row, index) => (
              <article key={`${row.organizerAccessCode}-${index}`} className="rounded border bg-white p-3 text-sm">
                <p className="text-xs text-slate-500">Organizer access code</p>
                <p className="font-mono font-semibold">{row.organizerAccessCode}</p>
                <p className="mt-1 text-xs text-slate-500">Name</p>
                <p>{row.organizerName}</p>
                <p className="mt-1 text-xs text-slate-500">Email</p>
                <p className="break-all">{row.organizerEmail}</p>
                <p className="mt-1 text-xs text-slate-500">Event name</p>
                <select
                  className="w-full rounded border p-2 text-sm"
                  value={row.selectedEventId}
                  onChange={(event) =>
                    setSelectedEventByOrganizer((prev) => ({
                      ...prev,
                      [row.organizerAccessCode]: event.target.value,
                    }))
                  }
                >
                  {row.events.map((eventOption) => (
                    <option key={eventOption.eventId} value={eventOption.eventId}>
                      {eventOption.eventName || "-"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Start date &amp; time</p>
                <p>{formatDate(row.selectedEvent?.eventDate)}</p>
                <p className="mt-1 text-xs text-slate-500">End date &amp; time</p>
                <p>{formatDate(row.selectedEvent?.eventEndDate)}</p>
                <p className="mt-1 text-xs text-slate-500">Sold tickets</p>
                <p>{Number(row.selectedEvent?.soldTickets || 0)}</p>
                {row.selectedEvent?.eventId ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      className="rounded border px-2 py-1 text-xs"
                      to={`/admin/events?organizerAccessCode=${encodeURIComponent(row.organizerAccessCode)}&eventId=${encodeURIComponent(row.selectedEvent.eventId)}`}
                    >
                      View Event
                    </Link>
                    <Link
                      className="rounded border px-2 py-1 text-xs"
                      to={`/admin/tickets?organizerAccessCode=${encodeURIComponent(row.organizerAccessCode)}&eventId=${encodeURIComponent(row.selectedEvent.eventId)}`}
                    >
                      Tickets
                    </Link>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Organizer access code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Event name</th>
                  <th className="px-3 py-2">Start date &amp; time</th>
                  <th className="px-3 py-2">End date &amp; time</th>
                  <th className="px-3 py-2">Sold tickets</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, index) => (
                  <tr key={`${row.organizerAccessCode}-${index}`} className="border-t align-top">
                    <td className="px-3 py-2 font-mono text-xs">{row.organizerAccessCode}</td>
                    <td className="px-3 py-2">{row.organizerName}</td>
                    <td className="px-3 py-2 break-all">{row.organizerEmail}</td>
                    <td className="px-3 py-2 min-w-[220px]">
                      <select
                        className="w-full rounded border p-2 text-sm"
                        value={row.selectedEventId}
                        onChange={(event) =>
                          setSelectedEventByOrganizer((prev) => ({
                            ...prev,
                            [row.organizerAccessCode]: event.target.value,
                          }))
                        }
                      >
                        {row.events.map((eventOption) => (
                          <option key={eventOption.eventId} value={eventOption.eventId}>
                            {eventOption.eventName || "-"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.selectedEvent?.eventDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.selectedEvent?.eventEndDate)}</td>
                    <td className="px-3 py-2">{Number(row.selectedEvent?.soldTickets || 0)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {row.selectedEvent?.eventId ? (
                          <Link
                            className="rounded border px-2 py-1 text-xs"
                            to={`/admin/events?organizerAccessCode=${encodeURIComponent(row.organizerAccessCode)}&eventId=${encodeURIComponent(row.selectedEvent.eventId)}`}
                          >
                            View Event
                          </Link>
                        ) : null}
                        {row.selectedEvent?.eventId ? (
                          <Link
                            className="rounded border px-2 py-1 text-xs"
                            to={`/admin/tickets?organizerAccessCode=${encodeURIComponent(row.organizerAccessCode)}&eventId=${encodeURIComponent(row.selectedEvent.eventId)}`}
                          >
                            Tickets
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(organizerRows.length / PAGE_SIZE))}
            totalItems={organizerRows.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(organizerRows.length / PAGE_SIZE)), prev + 1))}
          />
        </>
      ) : null}
    </section>
  );
}
