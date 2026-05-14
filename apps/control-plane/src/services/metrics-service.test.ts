import { describe, expect, it } from "vitest";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import { MetricsService } from "./metrics-service";

function createTask(
  overrides: Partial<TaskProjectionRecord> = {}
): TaskProjectionRecord {
  const now = "2026-05-02T00:00:00.000Z";

  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Build dashboard",
    prompt: overrides.prompt ?? "Create the dashboard",
    status: overrides.status ?? "completed",
    artifacts: overrides.artifacts ?? [],
    history: overrides.history ?? [
      { status: "draft", at: now, note: "created" },
      { status: overrides.status ?? "completed", at: now, note: "updated" }
    ],
    runIds: overrides.runIds ?? [],
    runs: overrides.runs ?? [],
    operatorAllowedActions: overrides.operatorAllowedActions ?? [],
    recoveryState: overrides.recoveryState ?? "healthy",
    recoveryReason: overrides.recoveryReason,
    lastRecoveredAt: overrides.lastRecoveredAt,
    latestEventId: overrides.latestEventId ?? 1,
    latestProjectionVersion: overrides.latestProjectionVersion ?? 1,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides
  };
}

function createSource(tasks: TaskProjectionRecord[]) {
  let calls = 0;

  return {
    async listTasks() {
      calls += 1;
      return tasks;
    },
    getCalls() {
      return calls;
    }
  };
}

describe("MetricsService", () => {
  it("caches metrics inside the ttl", async () => {
    let now = 1000;
    const source = createSource([createTask()]);
    const service = new MetricsService({
      source,
      ttlMs: 1000,
      now: () => now
    });

    await service.getMetrics();
    now = 1500;
    await service.getMetrics();

    expect(source.getCalls()).toBe(1);
  });

  it("refreshes metrics after ttl expiry", async () => {
    let now = 1000;
    const source = createSource([createTask()]);
    const service = new MetricsService({
      source,
      ttlMs: 1000,
      now: () => now
    });

    await service.getMetrics();
    now = 2001;
    await service.getMetrics();

    expect(source.getCalls()).toBe(2);
  });

  it("forces refresh when requested inside the ttl", async () => {
    const source = createSource([createTask()]);
    const service = new MetricsService({
      source,
      ttlMs: 1000,
      now: () => 1000
    });

    await service.getMetrics();
    await service.getMetrics({ refresh: true });

    expect(source.getCalls()).toBe(2);
  });

  it("computes task and run aggregates", async () => {
    const source = createSource([
      createTask({
        id: "task-1",
        status: "completed",
        runs: [
          { id: "run-1", agent: "agent-a", status: "completed", phase: "execution" },
          { id: "run-2", agent: "agent-b", status: "failed", phase: "verification" }
        ]
      }),
      createTask({
        id: "task-2",
        status: "awaiting_approval",
        recoveryState: "recovery_required",
        runs: [{ id: "run-3", agent: "agent-a", status: "awaiting", phase: "approval" }]
      }),
      createTask({
        id: "task-3",
        status: "failed",
        runs: [{ id: "run-4", agent: "agent-c", status: "created", phase: "intake" }]
      })
    ]);
    const service = new MetricsService({ source });

    const metrics = await service.refreshMetrics();

    expect(metrics.tasks).toEqual({
      total: 3,
      byStatus: {
        completed: 1,
        awaiting_approval: 1,
        failed: 1
      },
      recoveryRequired: 1,
      awaitingApproval: 1
    });
    expect(metrics.runs).toEqual({
      total: 4,
      byStatus: {
        completed: 1,
        failed: 1,
        awaiting: 1,
        created: 1
      },
      byAgent: {
        "agent-a": 2,
        "agent-b": 1,
        "agent-c": 1
      }
    });
  });
});
