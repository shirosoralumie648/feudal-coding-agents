import type { ACPAgentManifest } from "@feudal/acp";
import type {
  AlertEvent,
  AlertState,
  AuditTrailQuery,
  AuditTrailResponse,
  MetricSnapshot,
  OperatorActionRecord,
  OperatorActionSummary,
  TaskRecord
} from "@feudal/contracts";

export interface CreateTaskInput {
  title: string;
  prompt: string;
  allowMock: boolean;
  requiresApproval: boolean;
  sensitivity: "low" | "medium" | "high";
}

export type TaskConsoleRecord = TaskRecord & {
  recoveryState?: string;
  recoveryReason?: string;
  lastRecoveredAt?: string;
  latestEventId?: number;
  latestProjectionVersion?: number;
};

export interface TaskEventSummary {
  id: number;
  eventType: string;
  occurredAt: string;
}

export interface TaskDiffEntry {
  id: number;
  changedPaths: string[];
  afterSubsetJson: Record<string, unknown>;
}

export interface RecoverySummary {
  tasksNeedingRecovery: number;
  runsNeedingRecovery: number;
}

interface TaskDiffApiRecord {
  id: number;
  changedPaths?: string[];
  afterSubsetJson?: Record<string, unknown>;
  payloadJson?: {
    changedPaths?: unknown;
    afterSubsetJson?: unknown;
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json() as Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toTaskDiffEntry(diff: TaskDiffApiRecord): TaskDiffEntry {
  const payload = isRecord(diff.payloadJson) ? diff.payloadJson : undefined;
  const changedPathsSource =
    payload && Array.isArray(payload.changedPaths)
      ? payload.changedPaths
      : diff.changedPaths;
  const afterSubsetSource =
    payload && isRecord(payload.afterSubsetJson)
      ? payload.afterSubsetJson
      : diff.afterSubsetJson;

  return {
    id: diff.id,
    changedPaths: Array.isArray(changedPathsSource)
      ? changedPathsSource.filter((path): path is string => typeof path === "string")
      : [],
    afterSubsetJson: isRecord(afterSubsetSource) ? afterSubsetSource : {}
  };
}

export async function fetchTasks() {
  return requestJson<TaskConsoleRecord[]>("/api/tasks");
}

export async function fetchAgents() {
  return requestJson<ACPAgentManifest[]>("/api/agents");
}

export async function createTask(payload: CreateTaskInput) {
  return requestJson<TaskConsoleRecord>("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function approveTask(taskId: string) {
  return submitGovernanceAction(taskId, "approve");
}

export async function rejectTask(taskId: string) {
  return submitGovernanceAction(taskId, "reject");
}

export async function reviseTask(taskId: string, note: string) {
  return submitGovernanceAction(taskId, "revise", note);
}

export async function submitGovernanceAction(
  taskId: string,
  actionType: "approve" | "reject" | "revise",
  note?: string
) {
  return requestJson<TaskConsoleRecord>(
    `/api/tasks/${taskId}/governance-actions/${actionType}`,
    {
    method: "POST",
    headers: { "content-type": "application/json" },
      body: JSON.stringify(note === undefined ? {} : { note })
    }
  );
}

export async function recoverTask(taskId: string, note: string) {
  return requestJson<TaskConsoleRecord>(`/api/tasks/${taskId}/operator-actions/recover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note })
  });
}

export async function takeoverTask(taskId: string, note: string) {
  return requestJson<TaskConsoleRecord>(`/api/tasks/${taskId}/operator-actions/takeover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note })
  });
}

export async function abandonTask(taskId: string, note: string) {
  return requestJson<TaskConsoleRecord>(`/api/tasks/${taskId}/operator-actions/abandon`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note, confirm: true })
  });
}

export async function fetchTaskEvents(taskId: string) {
  return requestJson<TaskEventSummary[]>(`/api/tasks/${taskId}/events`);
}

export async function fetchTaskDiffs(taskId: string) {
  const diffs = await requestJson<TaskDiffApiRecord[]>(`/api/tasks/${taskId}/diffs`);
  return diffs.map(toTaskDiffEntry);
}

export async function fetchTaskReplay(taskId: string, asOfEventId: number) {
  return requestJson<{ task: Pick<TaskRecord, "id" | "title" | "status"> }>(
    `/api/tasks/${taskId}/replay?asOfEventId=${asOfEventId}`
  );
}

export async function fetchTaskOperatorActions(taskId: string) {
  return requestJson<OperatorActionRecord[]>(`/api/tasks/${taskId}/operator-actions`);
}

export async function fetchOperatorSummary() {
  return requestJson<OperatorActionSummary>("/api/operator-actions/summary");
}

export async function fetchRecoverySummary() {
  return requestJson<RecoverySummary>("/api/recovery/summary");
}

export async function fetchAnalyticsSnapshot() {
  return requestJson<MetricSnapshot | { status: string; message: string }>(
    "/api/analytics/snapshot"
  );
}

export function subscribeAnalytics(
  onSnapshot: (snapshot: MetricSnapshot) => void,
  onError?: () => void
) {
  const source = new EventSource("/api/analytics/stream");

  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);

      if (parsed.type === "snapshot" && parsed.payload) {
        onSnapshot(parsed.payload as MetricSnapshot);
      }
    } catch {
      // Ignore heartbeat comments and malformed frames.
    }
  };
  source.onerror = () => {
    onError?.();
  };

  return {
    eventSource: source,
    close: () => source.close()
  };
}

export async function fetchAuditTrail(query: AuditTrailQuery) {
  const params = new URLSearchParams();

  if (query.taskId) params.set("taskId", query.taskId);
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.eventType) params.set("eventType", query.eventType);
  if (query.timeRange) {
    params.set("timeRange[start]", query.timeRange.start);
    params.set("timeRange[end]", query.timeRange.end);
  }
  if (query.searchQuery) params.set("searchQuery", query.searchQuery);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", String(query.cursor));

  return requestJson<AuditTrailResponse>(
    `/api/analytics/audit-trail?${params.toString()}`
  );
}

export async function fetchAlertStates() {
  return requestJson<{ states: AlertState[] }>("/api/alerts/state");
}

export async function fetchPendingAlerts() {
  return requestJson<{ alerts: AlertEvent[] }>("/api/alerts/pending");
}
