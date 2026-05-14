import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import { createControlPlaneApp } from "../server";
import { MetricsService } from "../services/metrics-service";
import type { OrchestratorService } from "../services/orchestrator-service";
import { registerMetricsRoutes } from "./metrics";

function createTask(
  index: number,
  overrides: Partial<TaskProjectionRecord> = {}
): TaskProjectionRecord {
  const now = "2026-05-02T00:00:00.000Z";
  const runs = overrides.runs ?? [
    { id: `run-${index}-a`, agent: "agent-a", status: "completed", phase: "execution" },
    { id: `run-${index}-b`, agent: "agent-b", status: "failed", phase: "verification" },
    { id: `run-${index}-c`, agent: "agent-c", status: "created", phase: "intake" }
  ];

  return {
    id: overrides.id ?? `task-${index}`,
    title: overrides.title ?? `Task ${index}`,
    prompt: overrides.prompt ?? "Create the dashboard",
    status: overrides.status ?? "completed",
    artifacts: overrides.artifacts ?? [],
    history: overrides.history ?? [
      { status: "draft", at: now, note: "created" },
      { status: overrides.status ?? "completed", at: now, note: "updated" }
    ],
    runIds: overrides.runIds ?? runs.map((run) => run.id),
    runs,
    operatorAllowedActions: overrides.operatorAllowedActions ?? [],
    recoveryState: overrides.recoveryState ?? "healthy",
    recoveryReason: overrides.recoveryReason,
    lastRecoveredAt: overrides.lastRecoveredAt,
    latestEventId: overrides.latestEventId ?? index,
    latestProjectionVersion: overrides.latestProjectionVersion ?? 1,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides
  };
}

function createService(tasks: TaskProjectionRecord[]): OrchestratorService {
  return {
    coordinator: {} as OrchestratorService["coordinator"],
    governance: {} as OrchestratorService["governance"],
    operator: {} as OrchestratorService["operator"],
    replay: {} as OrchestratorService["replay"],
    async createTask() {
      throw new Error("not implemented");
    },
    async submitGovernanceAction() {
      throw new Error("not implemented");
    },
    async approveTask() {
      throw new Error("not implemented");
    },
    async rejectTask() {
      throw new Error("not implemented");
    },
    async submitRevision() {
      throw new Error("not implemented");
    },
    async recoverTask() {
      throw new Error("not implemented");
    },
    async takeoverTask() {
      throw new Error("not implemented");
    },
    async abandonTask() {
      throw new Error("not implemented");
    },
    async listTasks() {
      return tasks;
    },
    async getTask(taskId) {
      return tasks.find((task) => task.id === taskId);
    },
    async listOperatorActions() {
      return [];
    },
    async getOperatorActionSummary() {
      return { tasksNeedingOperatorAttention: 0, tasks: [] };
    },
    async listTaskEvents() {
      return [];
    },
    async listTaskDiffs() {
      return [];
    },
    async listTaskRuns(taskId) {
      return tasks.find((task) => task.id === taskId)?.runs;
    },
    async listTaskArtifacts(taskId) {
      return tasks.find((task) => task.id === taskId)?.artifacts;
    },
    async replayTaskAtEventId() {
      return undefined;
    },
    async getRecoverySummary() {
      return {
        tasksNeedingRecovery: 0,
        runsNeedingRecovery: 0,
        taskBreakdown: {
          healthy: tasks.length,
          replaying: 0,
          recoveryRequired: 0
        },
        runRecoveryBreakdown: {
          healthy: 0,
          replaying: 0,
          recoveryRequired: 0
        },
        runStatusBreakdown: {
          created: 0,
          inProgress: 0,
          awaiting: 0,
          completed: 0,
          failed: 0,
          cancelling: 0,
          cancelled: 0
        }
      };
    },
    async rebuildProjectionsIfNeeded() {},
    async listAgents() {
      return [];
    }
  };
}

describe("metrics routes", () => {
  it("keeps unavailable fallback when no metrics service is configured", async () => {
    const app = Fastify({ logger: false });
    registerMetricsRoutes(app);

    const response = await app.inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "metrics_unavailable",
      message: "No store configured for metrics collection"
    });
  });

  it("default app /metrics does not return metrics_unavailable", async () => {
    const app = createControlPlaneApp({
      logger: false,
      service: createService([createTask(1)])
    });

    await app.ready();
    const response = await app.inject({ method: "GET", url: "/metrics" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().status).not.toBe("metrics_unavailable");
    expect(response.json().tasks.total).toBe(1);
  });

  it("keeps token metrics as explicit zero placeholder", async () => {
    const app = Fastify({ logger: false });
    registerMetricsRoutes(app);

    const response = await app.inject({ method: "GET", url: "/metrics/tokens" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      byAgent: []
    });
  });

  it("serves a bounded local metrics fixture under 200ms", async () => {
    const tasks = Array.from({ length: 50 }, (_value, index) =>
      createTask(index + 1)
    );
    const metricsService = new MetricsService({
      source: { listTasks: async () => tasks }
    });
    const app = Fastify({ logger: false });
    registerMetricsRoutes(app, { metricsService });

    await metricsService.refreshMetrics();
    const startedAt = performance.now();
    const response = await app.inject({ method: "GET", url: "/metrics" });
    const elapsedMs = performance.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(elapsedMs).toBeLessThan(200);
    expect(response.json().tasks.total).toBe(50);
    expect(response.json().runs.total).toBe(150);
  });
});
