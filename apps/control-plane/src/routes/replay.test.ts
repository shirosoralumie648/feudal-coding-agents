import { newDb } from "pg-mem";
import { describe, expect, it, vi } from "vitest";
import { createHttpACPClient } from "@feudal/acp/http-client";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createPostgresEventStore, runMigrations } from "@feudal/persistence";
import { createGatewayApp } from "../../../acp-gateway/src/server";
import { createRunReadModel } from "../../../acp-gateway/src/persistence/run-read-model";
import type { CodexRunner } from "../../../acp-gateway/src/workers/types";
import { createTaskReadModel } from "../persistence/task-read-model";
import { createControlPlaneApp } from "../server";
import { createOrchestratorService } from "../services/orchestrator-service";

function createReplayApp() {
  return createControlPlaneApp({
    logger: false,
    service: createOrchestratorService({
      acpClient: createMockACPClient()
    })
  });
}

describe("replay routes", () => {
  it("returns events, diffs, replay snapshots, and recovery summary", async () => {
    const app = createReplayApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    const taskId = created.json().id;
    const events = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/events` });
    const diffs = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/diffs` });
    const runs = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/runs` });
    const artifacts = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/artifacts`
    });
    const replay = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/replay?asOfEventId=${created.json().latestEventId}`
    });
    const recovery = await app.inject({
      method: "GET",
      url: "/api/recovery/summary"
    });

    expect(events.statusCode).toBe(200);
    expect(events.json().length).toBeGreaterThan(0);
    expect(diffs.json().length).toBeGreaterThan(0);
    expect(runs.json().length).toBeGreaterThan(0);
    expect(artifacts.json().length).toBeGreaterThan(0);
    expect(replay.json().task.id).toBe(taskId);
    expect(recovery.json().tasksNeedingRecovery).toBeGreaterThanOrEqual(0);
  });

  it("returns task runs and artifacts from dedicated projections", async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    const eventStore = createPostgresEventStore({ pool });
    const codexRunner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ title: "Build dashboard", prompt: "Create dashboard" })
        .mockResolvedValueOnce({ summary: "Plan and review the task." })
        .mockResolvedValueOnce({ verdict: "approve", note: "No blocking issues." })
        .mockResolvedValueOnce({ verdict: "approve", note: "Looks good." })
    } satisfies CodexRunner;
    const gatewayBaseUrl = "http://gateway.local";
    const gateway = createGatewayApp({
      logger: false,
      codexRunner,
      store: createRunReadModel({ eventStore })
    });

    await gateway.ready();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const requestUrl = new URL(url);

        if (!url.startsWith(gatewayBaseUrl)) {
          throw new Error(`Unexpected fetch target: ${url}`);
        }

        const response = await gateway.inject({
          method: init?.method ?? "GET",
          url: `${requestUrl.pathname}${requestUrl.search}`,
          headers: init?.headers as Record<string, string> | undefined,
          payload: init?.body
        });

        return new Response(response.body, {
          status: response.statusCode,
          headers: new Headers(
            Object.entries(response.headers).map(([key, value]) => [key, String(value)])
          )
        });
      })
    );

    const app = createControlPlaneApp({
      logger: false,
      service: createOrchestratorService({
        acpClient: createHttpACPClient({ baseUrl: gatewayBaseUrl }),
        store: createTaskReadModel({ eventStore })
      })
    });

    await app.ready();

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          title: "Build dashboard",
          prompt: "Create the dashboard task",
          allowMock: false,
          requiresApproval: true,
          sensitivity: "medium"
        }
      });

      const taskId = created.json().id;
      const runs = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/runs` });
      const artifacts = await app.inject({
        method: "GET",
        url: `/api/tasks/${taskId}/artifacts`
      });

      expect(runs.statusCode).toBe(200);
      expect(runs.json().map((run: { phase: string }) => run.phase)).toContain("approval");
      expect(artifacts.statusCode).toBe(200);
      expect(
        artifacts.json().map((artifact: { name: string }) => artifact.name)
      ).toContain("decision-brief.json");
    } finally {
      await Promise.all([app.close(), gateway.close(), pool.end()]);
      vi.unstubAllGlobals();
    }
  });
});
