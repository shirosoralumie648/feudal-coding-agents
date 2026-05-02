import { describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "@feudal/contracts";
import { AnalyticsService } from "./analytics-service";
import { MemoryTaskStore } from "../store";

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const now = "2026-05-02T00:00:00.000Z";

  return {
    id: overrides.id ?? `task-${Math.random().toString(16).slice(2)}`,
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
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides
  };
}

async function saveTask(store: MemoryTaskStore, task: TaskRecord) {
  return store.saveTask(task, "task.test", 0);
}

describe("AnalyticsService", () => {
  it("polls TaskStore and returns total task count", async () => {
    const store = new MemoryTaskStore();
    await saveTask(store, createTask({ id: "task-1" }));
    await saveTask(store, createTask({ id: "task-2" }));
    const service = new AnalyticsService({ store });

    const snapshot = await service.pollMetrics();

    expect(snapshot.totalTaskCount).toBe(2);
  });

  it("computes task status counts", async () => {
    const store = new MemoryTaskStore();
    await saveTask(store, createTask({ id: "task-1", status: "completed" }));
    await saveTask(store, createTask({ id: "task-2", status: "failed" }));
    const service = new AnalyticsService({ store });

    const snapshot = await service.pollMetrics();

    expect(snapshot.tasksByStatus).toEqual({
      completed: 1,
      failed: 1
    });
  });

  it("computes run counts by agent and status", async () => {
    const store = new MemoryTaskStore();
    await saveTask(
      store,
      createTask({
        id: "task-1",
        runIds: ["run-1", "run-2"],
        runs: [
          { id: "run-1", agent: "agent-a", status: "completed", phase: "execution" },
          { id: "run-2", agent: "agent-a", status: "failed", phase: "verification" }
        ]
      })
    );
    const service = new AnalyticsService({ store });

    const snapshot = await service.pollMetrics();

    expect(snapshot.totalRunCount).toBe(2);
    expect(snapshot.runsByAgent).toEqual({ "agent-a": 2 });
    expect(snapshot.runsByStatus).toEqual({ completed: 1, failed: 1 });
  });

  it("computes error rate from failed and partial-success tasks", async () => {
    const store = new MemoryTaskStore();
    await saveTask(store, createTask({ id: "task-1", status: "failed" }));
    await saveTask(store, createTask({ id: "task-2", status: "partial_success" }));
    await saveTask(store, createTask({ id: "task-3", status: "completed" }));
    await saveTask(store, createTask({ id: "task-4", status: "awaiting_approval" }));
    const service = new AnalyticsService({ store });

    const snapshot = await service.pollMetrics();

    expect(snapshot.errorRate).toBe(0.5);
  });

  it("computes approval latency from awaiting approval history entries", async () => {
    const store = new MemoryTaskStore();
    await saveTask(
      store,
      createTask({
        id: "task-1",
        history: [
          {
            status: "awaiting_approval",
            at: "2026-05-02T00:00:00.000Z",
            note: "waiting"
          },
          {
            status: "dispatching",
            at: "2026-05-02T00:00:02.000Z",
            note: "approved"
          }
        ]
      })
    );
    const service = new AnalyticsService({ store });

    const snapshot = await service.pollMetrics();

    expect(snapshot.avgApprovalLatencyMs).toBe(2000);
  });

  it("starts and stops periodic polling", () => {
    vi.useFakeTimers();
    const store = new MemoryTaskStore();
    const service = new AnalyticsService({ store, intervalMs: 1000 });
    const pollSpy = vi.spyOn(service, "pollMetrics").mockResolvedValue({
      timestamp: "2026-05-02T00:00:00.000Z",
      tasksByStatus: {},
      runsByAgent: {},
      runsByStatus: {},
      totalTaskCount: 0,
      totalRunCount: 0,
      awaitingApproval: 0,
      recoveryRequired: 0,
      avgApprovalLatencyMs: null,
      errorRate: 0,
      tokenUsage: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        byAgent: []
      }
    });

    service.start();
    vi.advanceTimersByTime(1000);
    service.stop();
    vi.advanceTimersByTime(1000);

    expect(pollSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("notifies subscribed listeners and supports unsubscribe", async () => {
    const store = new MemoryTaskStore();
    await saveTask(store, createTask({ id: "task-1" }));
    const service = new AnalyticsService({ store });
    const listener = { onMetricSnapshot: vi.fn() };
    const unsubscribe = service.subscribe(listener);

    const snapshot = await service.pollMetrics();
    unsubscribe();
    await service.pollMetrics();

    expect(listener.onMetricSnapshot).toHaveBeenCalledTimes(1);
    expect(listener.onMetricSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it("caches the latest snapshot after polling", async () => {
    const store = new MemoryTaskStore();
    const service = new AnalyticsService({ store });

    expect(service.getLatestSnapshot()).toBeUndefined();

    const snapshot = await service.pollMetrics();

    expect(service.getLatestSnapshot()).toEqual(snapshot);
  });
});

