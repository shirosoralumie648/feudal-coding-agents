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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json() as Promise<T>;
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

export async function fetchTaskEvents(taskId: string) {
  return requestJson<TaskEventSummary[]>(`/api/tasks/${taskId}/events`);
}

export async function fetchTaskDiffs(taskId: string) {
  return requestJson<TaskDiffEntry[]>(`/api/tasks/${taskId}/diffs`);
}

export async function fetchTaskReplay(taskId: string, asOfEventId: number) {
  return requestJson<{ task: Pick<TaskRecord, "id" | "title" | "status"> }>(
    `/api/tasks/${taskId}/replay?asOfEventId=${asOfEventId}`
  );
}

export async function fetchRecoverySummary() {
  return requestJson<RecoverySummary>("/api/recovery/summary");
}
