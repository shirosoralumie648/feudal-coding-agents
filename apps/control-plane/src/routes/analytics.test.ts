import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { MetricSnapshot, TaskRecord } from "@feudal/contracts";
import { registerAnalyticsRoutes } from "./analytics";
import { AnalyticsService } from "../services/analytics-service";
import { MemoryTaskStore } from "../store";

const snapshot: MetricSnapshot = {
  timestamp: "2026-05-02T00:00:00.000Z",
  tasksByStatus: { completed: 1 },
  runsByAgent: {},
  runsByStatus: {},
  totalTaskCount: 1,
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
};

function createTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const now = overrides.updatedAt ?? "2026-05-02T00:00:00.000Z";

  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Build dashboard",
    prompt: overrides.prompt ?? "Create the dashboard",
    status: overrides.status ?? "completed",
    artifacts: overrides.artifacts ?? [],
    history: overrides.history ?? [],
    runIds: overrides.runIds ?? [],
    runs: overrides.runs ?? [],
    operatorAllowedActions: overrides.operatorAllowedActions ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: now,
    ...overrides
  };
}

async function createAppWithService(service: AnalyticsService) {
  const app = Fastify();
  registerAnalyticsRoutes(app, { analyticsService: service });
  await app.ready();
  return app;
}

describe("analytics routes", () => {
  const apps: Array<Awaited<ReturnType<typeof createAppWithService>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("returns the latest snapshot", async () => {
    const service = new AnalyticsService({ store: new MemoryTaskStore() });
    await service.pollMetrics();
    const app = await createAppWithService(service);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/analytics/snapshot" });

    expect(response.statusCode).toBe(200);
    expect(response.json().totalTaskCount).toBe(0);
  });

  it("returns 503 when no snapshot has been computed", async () => {
    const app = await createAppWithService(
      new AnalyticsService({ store: new MemoryTaskStore() })
    );
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/analytics/snapshot" });

    expect(response.statusCode).toBe(503);
    expect(response.json().status).toBe("no_data");
  });

  it("streams snapshot events as text/event-stream", async () => {
    const store = new MemoryTaskStore();
    const service = new AnalyticsService({ store });
    await service.pollMetrics();
    const app = await createAppWithService(service);
    apps.push(app);
    await app.listen({ port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Fastify did not expose a test port");
    }
    const controller = new AbortController();

    const response = await fetch(`http://127.0.0.1:${address.port}/analytics/stream`, {
      signal: controller.signal
    });
    const chunk = await response.body?.getReader().read();
    controller.abort();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(new TextDecoder().decode(chunk?.value)).toContain("\"type\":\"snapshot\"");
  });

  it("pushes snapshot events when AnalyticsService emits updates", async () => {
    const store = new MemoryTaskStore();
    const service = new AnalyticsService({ store });
    const app = await createAppWithService(service);
    apps.push(app);
    await app.listen({ port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Fastify did not expose a test port");
    }
    const controller = new AbortController();
    const responsePromise = fetch(`http://127.0.0.1:${address.port}/analytics/stream`, {
      signal: controller.signal
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.pollMetrics();
    const response = await responsePromise;
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    await reader.cancel().catch(() => {});
    controller.abort();

    expect(new TextDecoder().decode(chunk.value)).toContain("\"payload\"");
  });

  it("returns audit trail event entries", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(createTask(), "task.created", 0);
    const app = await createAppWithService(new AnalyticsService({ store }));
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/analytics/audit-trail"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries.length).toBeGreaterThan(0);
  });

  it("filters audit trail by task ID", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(createTask({ id: "task-1" }), "task.created", 0);
    await store.saveTask(createTask({ id: "task-2" }), "task.created", 0);
    const app = await createAppWithService(new AnalyticsService({ store }));
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/analytics/audit-trail?taskId=task-2"
    });

    expect(
      response.json().entries.every((entry: { streamId: string }) => entry.streamId === "task-2")
    ).toBe(true);
  });

  it("filters audit trail by payload search query", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(
      createTask({ id: "task-1", title: "Contains needle" }),
      "task.created",
      0
    );
    await store.saveTask(createTask({ id: "task-2", title: "Plain" }), "task.created", 0);
    const app = await createAppWithService(new AnalyticsService({ store }));
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/analytics/audit-trail?searchQuery=needle"
    });

    expect(response.json().entries.length).toBeGreaterThan(0);
    expect(
      response
        .json()
        .entries.every((entry: { payloadSummary: string }) =>
          entry.payloadSummary.toLowerCase().includes("needle")
        )
    ).toBe(true);
  });

  it("filters audit trail by time range", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(
      createTask({ id: "task-1", updatedAt: "2026-05-02T00:00:00.000Z" }),
      "task.created",
      0
    );
    const app = await createAppWithService(new AnalyticsService({ store }));
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url:
        "/analytics/audit-trail?timeRange[start]=2026-05-01T00:00:00.000Z&timeRange[end]=2026-05-03T00:00:00.000Z"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid audit trail filters", async () => {
    const app = await createAppWithService(
      new AnalyticsService({ store: new MemoryTaskStore() })
    );
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/analytics/audit-trail?limit=1000"
    });

    expect(response.statusCode).toBe(400);
  });
});
