import type { ACPAgentManifest } from "@feudal/acp";
import type { TaskRecord } from "@feudal/contracts";

export interface CreateTaskInput {
  title: string;
  prompt: string;
  allowMock: boolean;
  requiresApproval: boolean;
  sensitivity: "low" | "medium" | "high";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchTasks() {
  return requestJson<TaskRecord[]>("/api/tasks");
}

export async function fetchAgents() {
  return requestJson<ACPAgentManifest[]>("/api/agents");
}

export async function createTask(payload: CreateTaskInput) {
  return requestJson<TaskRecord>("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function approveTask(taskId: string) {
  return requestJson<TaskRecord>(`/api/tasks/${taskId}/approve`, {
    method: "POST"
  });
}
