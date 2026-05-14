import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditTrailEntry, AuditTrailQuery } from "@feudal/contracts";
import { fetchAuditTrail } from "../lib/api";

type AuditViewMode = "timeline" | "table";

interface FilterDraft {
  taskId: string;
  agentId: string;
  eventType: string;
  timeStart: string;
  timeEnd: string;
  searchQuery: string;
}

const DEFAULT_LIMIT = 50;

const emptyFilters: FilterDraft = {
  taskId: "",
  agentId: "",
  eventType: "",
  timeStart: "",
  timeEnd: "",
  searchQuery: ""
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "medium"
  });
}

function toIsoDateTime(value: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function toAuditTrailQuery(draft: FilterDraft, cursor?: number): AuditTrailQuery {
  const start = toIsoDateTime(draft.timeStart);
  const end = toIsoDateTime(draft.timeEnd);
  const query: AuditTrailQuery = {
    limit: DEFAULT_LIMIT,
    cursor
  };

  if (draft.taskId.trim()) {
    query.taskId = draft.taskId.trim();
  }
  if (draft.agentId.trim()) {
    query.agentId = draft.agentId.trim();
  }
  if (draft.eventType.trim()) {
    query.eventType = draft.eventType.trim();
  }
  if (draft.searchQuery.trim()) {
    query.searchQuery = draft.searchQuery.trim();
  }
  if (start && end) {
    query.timeRange = { start, end };
  }

  return query;
}

function payloadPreview(entry: AuditTrailEntry) {
  return entry.payloadSummary || "No payload summary";
}

function AuditTimeline(props: { entries: AuditTrailEntry[] }) {
  return (
    <ul className="detail-list audit-timeline">
      {props.entries.map((entry) => (
        <li key={entry.eventId}>
          <div>
            <strong>{entry.eventType}</strong>
            <span>
              {entry.streamType}:{entry.streamId}
            </span>
            <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
          </div>
          <p className="payload-summary">{payloadPreview(entry)}</p>
        </li>
      ))}
    </ul>
  );
}

function AuditTable(props: { entries: AuditTrailEntry[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Stream</th>
            <th>Type</th>
            <th>Time</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {props.entries.map((entry) => (
            <tr key={entry.eventId}>
              <td>{entry.eventId}</td>
              <td>
                {entry.streamType}:{entry.streamId}
              </td>
              <td>{entry.eventType}</td>
              <td>{formatDateTime(entry.occurredAt)}</td>
              <td className="truncate">{payloadPreview(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditTrailViewer() {
  const [viewMode, setViewMode] = useState<AuditViewMode>("timeline");
  const [filters, setFilters] = useState<FilterDraft>(emptyFilters);
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<number>();
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const searchDebounceRef = useRef<number | undefined>(undefined);

  const loadEntries = useCallback(
    async (
      nextFilters: FilterDraft,
      options: { append?: boolean; cursor?: number } = {}
    ) => {
      setLoading(true);
      setError(undefined);

      try {
        const response = await fetchAuditTrail(
          toAuditTrailQuery(nextFilters, options.cursor)
        );

        setEntries((current) =>
          options.append ? [...current, ...response.entries] : response.entries
        );
        setNextCursor(response.nextCursor);
        setTotalCount(response.totalCount);
      } catch (nextError: unknown) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load audit trail"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadEntries(emptyFilters);

    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, [loadEntries]);

  function updateFilter(
    field: keyof FilterDraft,
    value: string,
    options: { debounce?: boolean } = {}
  ) {
    const nextFilters = { ...filters, [field]: value };
    setFilters(nextFilters);

    if (!options.debounce) {
      return;
    }

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(() => {
      void loadEntries(nextFilters);
    }, 500);
  }

  function applyFilters() {
    void loadEntries(filters);
  }

  function clearFilters() {
    setFilters(emptyFilters);
    void loadEntries(emptyFilters);
  }

  function loadMore() {
    if (nextCursor === undefined) {
      return;
    }

    void loadEntries(filters, { append: true, cursor: nextCursor });
  }

  return (
    <section className="panel panel-audit">
      <div className="panel-header">
        <div>
          <h2>Audit Trail</h2>
          <span>{totalCount} events</span>
        </div>
        <button
          type="button"
          onClick={() =>
            setViewMode((current) =>
              current === "timeline" ? "table" : "timeline"
            )
          }
        >
          {viewMode === "timeline" ? "Table View" : "Timeline View"}
        </button>
      </div>

      <div className="filter-bar">
        <input
          placeholder="Task ID"
          value={filters.taskId}
          onChange={(event) => updateFilter("taskId", event.target.value)}
        />
        <input
          placeholder="Agent ID"
          value={filters.agentId}
          onChange={(event) => updateFilter("agentId", event.target.value)}
        />
        <input
          placeholder="Event Type"
          value={filters.eventType}
          onChange={(event) => updateFilter("eventType", event.target.value)}
        />
        <input
          aria-label="Time range start"
          type="datetime-local"
          value={filters.timeStart}
          onChange={(event) => updateFilter("timeStart", event.target.value)}
        />
        <input
          aria-label="Time range end"
          type="datetime-local"
          value={filters.timeEnd}
          onChange={(event) => updateFilter("timeEnd", event.target.value)}
        />
        <input
          placeholder="Search events..."
          value={filters.searchQuery}
          onChange={(event) =>
            updateFilter("searchQuery", event.target.value, { debounce: true })
          }
        />
        <button type="button" onClick={applyFilters}>
          Apply Filters
        </button>
        <button type="button" onClick={clearFilters}>
          Clear
        </button>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}
      {loading ? <p className="status-message">Loading events...</p> : null}

      {!loading && entries.length === 0 ? (
        <p className="empty-state">No events match the current filters</p>
      ) : null}

      {entries.length > 0 && viewMode === "timeline" ? (
        <AuditTimeline entries={entries} />
      ) : null}

      {entries.length > 0 && viewMode === "table" ? (
        <AuditTable entries={entries} />
      ) : null}

      {nextCursor !== undefined ? (
        <button type="button" className="load-more" onClick={loadMore}>
          Load More
        </button>
      ) : null}
    </section>
  );
}
