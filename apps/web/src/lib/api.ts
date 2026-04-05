import type { ACPAgentManifest } from "@feudal/acp";
import type { TaskRecord } from "@feudal/contracts";

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
  return requestJson<TaskConsoleRecord>(`/api/tasks/${taskId}/approve`, {
    method: "POST"
  });
}

export async function rejectTask(taskId: string) {
  return requestJson<TaskConsoleRecord>(`/api/tasks/${taskId}/reject`, {
    method: "POST"
  });
}

export async function reviseTask(taskId: string, note: string) {
  return requestJson<TaskConsoleRecord>(`/api/tasks/${taskId}/revise`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note })
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

export async function fetchRecoverySummary() {
  return requestJson<RecoverySummary>("/api/recovery/summary");
}
