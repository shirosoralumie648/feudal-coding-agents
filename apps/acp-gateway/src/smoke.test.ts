import { newDb } from "pg-mem";
import { describe, expect, it, vi } from "vitest";
import { createHttpACPClient } from "@feudal/acp/http-client";
import { createPostgresEventStore, runMigrations } from "@feudal/persistence";
import { createGatewayApp } from "./server";
import { createControlPlaneApp } from "../../control-plane/src/server";
import { createTaskReadModel } from "../../control-plane/src/persistence/task-read-model";
import { GatewayStore } from "./store";
import { createRunReadModel } from "./persistence/run-read-model";
import { createOrchestratorService } from "../../control-plane/src/services/orchestrator-service";
import type { CodexRunner } from "./workers/types";

async function runSmokeScenario() {
  const codexRunner = {
    run: vi
      .fn()
      .mockResolvedValueOnce({ title: "Build dashboard", prompt: "Create dashboard" })
      .mockResolvedValueOnce({ summary: "Plan and review the task." })
      .mockResolvedValueOnce({ verdict: "approve", note: "No blocking issues." })
      .mockResolvedValueOnce({ verdict: "approve", note: "Looks good." })
      .mockResolvedValueOnce({
        result: "completed",
        output: "Executor finished the work."
      })
      .mockResolvedValueOnce({
        result: "verified",
        output: "Verifier accepted the work."
      })
  } satisfies CodexRunner;

  const gateway = createGatewayApp({
    logger: false,
    codexRunner,
    store: new GatewayStore()
  });
  const gatewayBaseUrl = "http://gateway.local";

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

  const controlPlane = createControlPlaneApp({
    logger: false,
    service: createOrchestratorService({
      acpClient: createHttpACPClient({ baseUrl: gatewayBaseUrl })
    })
  });

  await controlPlane.ready();

  try {
    const created = await controlPlane.inject({
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

    const approved = await controlPlane.inject({
      method: "POST",
      url: `/api/tasks/${created.json().id}/approve`
    });

    return {
      created: created.json(),
      approved: approved.json()
    };
  } finally {
    await Promise.all([controlPlane.close(), gateway.close()]);
    vi.unstubAllGlobals();
  }
}

describe("phase 2 smoke flow", () => {
  it("creates, approves, executes, and verifies through the gateway", async () => {
    const result = await runSmokeScenario();

    expect(result.created.status).toBe("awaiting_approval");
    expect(result.approved.status).toBe("completed");
    expect(result.approved.artifacts.map((artifact: { name: string }) => artifact.name)).toContain(
      "execution-report.json"
    );
  });

  it("rebuilds persisted state after a simulated restart", async () => {
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
    const firstGateway = createGatewayApp({
      logger: false,
      codexRunner,
      store: createRunReadModel({ eventStore })
    });

    await firstGateway.ready();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const requestUrl = new URL(url);

        if (!url.startsWith(gatewayBaseUrl)) {
          throw new Error(`Unexpected fetch target: ${url}`);
        }

        const response = await firstGateway.inject({
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

    const firstControlPlane = createControlPlaneApp({
      logger: false,
      service: createOrchestratorService({
        acpClient: createHttpACPClient({ baseUrl: gatewayBaseUrl }),
        store: createTaskReadModel({ eventStore })
      })
    });

    await firstControlPlane.ready();

    const created = await firstControlPlane.inject({
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

    await pool.query("delete from tasks_current");
    await pool.query("delete from runs_current");
    await pool.query("delete from projection_checkpoint");
    await Promise.all([firstControlPlane.close(), firstGateway.close()]);

    const restartedGateway = createGatewayApp({
      logger: false,
      codexRunner,
      store: createRunReadModel({ eventStore })
    });
    const restartedControlPlane = createControlPlaneApp({
      logger: false,
      service: createOrchestratorService({
        acpClient: createHttpACPClient({ baseUrl: gatewayBaseUrl }),
        store: createTaskReadModel({ eventStore })
      })
    });

    await Promise.all([restartedGateway.ready(), restartedControlPlane.ready()]);

    try {
      const replay = await restartedControlPlane.inject({
        method: "GET",
        url: `/api/tasks/${created.json().id}/replay?asOfEventId=${created.json().latestEventId}`
      });
      const run = await restartedGateway.inject({
        method: "GET",
        url: `/runs/${created.json().approvalRunId}`
      });

      expect(replay.statusCode).toBe(200);
      expect(replay.json().task.status).toBe("awaiting_approval");
      expect(run.statusCode).toBe(200);
      expect(run.json().status).toBe("awaiting");
    } finally {
      await Promise.all([restartedControlPlane.close(), restartedGateway.close()]);
      vi.unstubAllGlobals();
    }
  });
});
