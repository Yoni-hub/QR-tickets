import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { adminApi } from "../../lib/adminApi";
import FilterBar from "../../components/admin/FilterBar";
import SearchInput from "../../components/admin/SearchInput";
import StatusBadge from "../../components/admin/StatusBadge";
import LoadingState from "../../components/admin/LoadingState";
import ErrorState from "../../components/admin/ErrorState";
import EmptyState from "../../components/admin/EmptyState";
import ConfirmActionModal from "../../components/admin/ConfirmActionModal";
import PaginationControls from "../../components/admin/PaginationControls";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

const EVENT_ACTIONS = {
  disable: { label: "Disable Event", endpoint: "disable", confirm: "Disable this event?" },
  enable: { label: "Enable Event", endpoint: "enable", confirm: "Enable this event?" },
  archive: { label: "Archive Event", endpoint: "archive", confirm: "Archive this event?" },
  rotate: { label: "Rotate Access Code", endpoint: "rotate-access-code", confirm: "Rotate access code?" },
  lockScanner: { label: "Lock Scanner", endpoint: "lock-scanner", confirm: "Lock scanner for this event?" },
  unlockScanner: { label: "Unlock Scanner", endpoint: "unlock-scanner", confirm: "Unlock scanner for this event?" },
};

export default function AdminEventsPage() {
  const PAGE_SIZE = 20;
  const [urlParams] = useSearchParams();
  const organizerAccessCodeFilter = String(urlParams.get("organizerAccessCode") || "").trim();
  const preferredEventId = String(urlParams.get("eventId") || "").trim();
  const [search, setSearch] = useState(() => organizerAccessCodeFilter || "");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedEventByOrganizer, setSelectedEventByOrganizer] = useState({});

  const queryParams = useMemo(
    () => ({
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [status, dateFrom, dateTo],
  );

  const load = async (overrideSearch) => {
    setLoading(true);
    setError("");
    try {
      const resolvedSearch = String(overrideSearch ?? search).trim();
      const response = await adminApi.get("/events", {
        params: {
          ...queryParams,
          search: resolvedSearch || undefined,
        },
      });
      const nextItems = Array.isArray(response.data?.items) ? response.data.items : [];
      const nextSelections = {};
      for (const row of nextItems) {
        const organizerKey = String(row.organizerAccessCode || row.accessCode || row.eventId || "").trim();
        if (!organizerKey || nextSelections[organizerKey]) continue;
        if (
          preferredEventId
          && organizerAccessCodeFilter
          && organizerKey === organizerAccessCodeFilter
          && row.eventId === preferredEventId
        ) {
          nextSelections[organizerKey] = preferredEventId;
        } else {
          nextSelections[organizerKey] = row.eventId;
        }
      }
      setSelectedEventByOrganizer(nextSelections);
      setItems(nextItems);
      setPage(1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizerAccessCodeFilter) setSearch(organizerAccessCodeFilter);
    load(organizerAccessCodeFilter || undefined);
  }, [organizerAccessCodeFilter, preferredEventId]);

  const executeAction = async () => {
    if (!action) return;
    setActionLoading(true);
    try {
      const descriptor = EVENT_ACTIONS[action.type];
      await adminApi.patch(`/events/${encodeURIComponent(action.eventId)}/${descriptor.endpoint}`);
      setAction(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const groupedRows = useMemo(() => {
    const map = new Map();
    for (const event of items) {
      const key = String(event.organizerAccessCode || event.accessCode || event.eventId || "").trim();
      if (!map.has(key)) {
        map.set(key, {
          organizerAccessCode: event.organizerAccessCode || event.accessCode || "-",
          events: [],
        });
      }
      map.get(key).events.push(event);
    }

    return Array.from(map.values()).map((row) => {
      const selectedEventId = selectedEventByOrganizer[row.organizerAccessCode] || row.events[0]?.eventId || "";
      const selectedEvent = row.events.find((event) => event.eventId === selectedEventId) || row.events[0] || null;
      return {
        organizerAccessCode: row.organizerAccessCode,
        events: row.events,
        selectedEventId,
        selectedEvent,
      };
    });
  }, [items, selectedEventByOrganizer]);

  const pagedRows = groupedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="space-y-3">
      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search event name, organizer code, organizer email" />
        <select className="rounded border p-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input className="rounded border p-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        <input className="rounded border p-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        <button className="rounded border bg-white px-3 py-2 text-sm" onClick={load}>Apply Filters</button>
      </FilterBar>

      {loading ? <LoadingState label="Loading events..." /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && !groupedRows.length ? <EmptyState label="No events found." /> : null}

      {!loading && !error && groupedRows.length ? (
        <>
          <div className="space-y-2 md:hidden">
            {pagedRows.map((row, index) => {
              const event = row.selectedEvent;
              if (!event) return null;
              return (
                <article key={`${row.organizerAccessCode}-${index}`} className="rounded border bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{event.eventName}</p>
                    <StatusBadge value={event.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Organizer access code</p>
                  <p className="font-mono">{row.organizerAccessCode || "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">Event name</p>
                  <select
                    className="w-full rounded border p-2 text-sm"
                    value={row.selectedEventId}
                    onChange={(evt) =>
                      setSelectedEventByOrganizer((prev) => ({
                        ...prev,
                        [row.organizerAccessCode]: evt.target.value,
                      }))
                    }
                  >
                    {row.events.map((option) => (
                      <option key={option.eventId} value={option.eventId}>
                        {option.eventName}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Start date &amp; time</p>
                  <p>{formatDate(event.eventDate)}</p>
                  <p className="mt-1 text-xs text-slate-500">End date &amp; time</p>
                  <p>{formatDate(event.eventEndDate)}</p>
                  <p className="mt-1 text-xs text-slate-500">Location</p>
                  <p>{event.location || "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">Stop selling after</p>
                  <p>{formatDate(event.stopSellingAfter)}</p>
                  <p className="mt-1 text-xs text-slate-500">Sell tickets window</p>
                  <p>{event.salesWindowStart && event.salesWindowEnd ? `${event.salesWindowStart} - ${event.salesWindowEnd}` : "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">Max tickets per email</p>
                  <p>{event.maxTicketsPerEmail ?? "-"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link className="rounded border px-2 py-1 text-xs" to={`/admin/tickets?eventId=${encodeURIComponent(event.eventId)}`}>Tickets</Link>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "disable", ...event })}>Disable</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "enable", ...event })}>Enable</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "archive", ...event })}>Archive</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "rotate", ...event })}>Rotate Code</button>
                    {event.scannerLocked ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "unlockScanner", ...event })}>Unlock Scanner</button>
                    ) : (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "lockScanner", ...event })}>Lock Scanner</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Organizer access code</th>
                  <th className="px-3 py-2">Event name</th>
                  <th className="px-3 py-2">Start date &amp; time</th>
                  <th className="px-3 py-2">End date &amp; time</th>
                  <th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, index) => {
                  const event = row.selectedEvent;
                  if (!event) return null;
                  return (
                    <Fragment key={`${row.organizerAccessCode}-${index}`}>
                      <tr className="border-t align-top bg-amber-50">
                        <td className="px-3 py-2 font-mono text-xs">{row.organizerAccessCode || "-"}</td>
                        <td className="px-3 py-2 min-w-[220px]">
                          <select
                            className="w-full rounded border p-2 text-sm"
                            value={row.selectedEventId}
                            onChange={(evt) =>
                              setSelectedEventByOrganizer((prev) => ({
                                ...prev,
                                [row.organizerAccessCode]: evt.target.value,
                              }))
                            }
                          >
                            {row.events.map((option) => (
                              <option key={option.eventId} value={option.eventId}>
                                {option.eventName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(event.eventDate)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(event.eventEndDate)}</td>
                        <td className="px-3 py-2">{event.location || "-"}</td>
                      </tr>
                      <tr className="border-t bg-slate-50">
                        <td className="px-3 py-2 text-xs font-semibold text-slate-600" colSpan={5}>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-xs">
                              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="px-2 py-1">Stop selling after</th>
                                  <th className="px-2 py-1">Sell tickets from-to</th>
                                  <th className="px-2 py-1">Max tickets per email</th>
                                  <th className="px-2 py-1">Status</th>
                                  <th className="px-2 py-1">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-t border-slate-200">
                                  <td className="px-2 py-2 whitespace-nowrap font-normal text-slate-800">{formatDate(event.stopSellingAfter)}</td>
                                  <td className="px-2 py-2 font-normal text-slate-800">{event.salesWindowStart && event.salesWindowEnd ? `${event.salesWindowStart} - ${event.salesWindowEnd}` : "-"}</td>
                                  <td className="px-2 py-2 font-normal text-slate-800">{event.maxTicketsPerEmail ?? "-"}</td>
                                  <td className="px-2 py-2"><StatusBadge value={event.status} /></td>
                                  <td className="px-2 py-2">
                                    <div className="flex flex-wrap gap-1">
                                      <Link className="rounded border px-2 py-1 text-xs" to={`/admin/tickets?eventId=${encodeURIComponent(event.eventId)}`}>Tickets</Link>
                                      <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "disable", ...event })}>Disable</button>
                                      <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "enable", ...event })}>Enable</button>
                                      <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "archive", ...event })}>Archive</button>
                                      <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "rotate", ...event })}>Rotate Code</button>
                                      {event.scannerLocked ? (
                                        <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "unlockScanner", ...event })}>Unlock Scanner</button>
                                      ) : (
                                        <button className="rounded border px-2 py-1 text-xs" onClick={() => setAction({ type: "lockScanner", ...event })}>Lock Scanner</button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={page}
            totalPages={Math.max(1, Math.ceil(groupedRows.length / PAGE_SIZE))}
            totalItems={groupedRows.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(Math.max(1, Math.ceil(groupedRows.length / PAGE_SIZE)), prev + 1))}
          />
        </>
      ) : null}

      <ConfirmActionModal
        open={Boolean(action)}
        title={action ? EVENT_ACTIONS[action.type]?.label : "Confirm"}
        message={action ? EVENT_ACTIONS[action.type]?.confirm : ""}
        confirmLabel="Confirm"
        onConfirm={executeAction}
        onCancel={() => setAction(null)}
        loading={actionLoading}
      />
    </section>
  );
}
