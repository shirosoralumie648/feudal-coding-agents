import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { GatewayRunStore } from "../store";
import { registerAgentRoutes } from "./agents";
import { registerRunRoutes } from "./runs";

describe("acp-gateway runs routes", () => {
  it("supports discovery, await creation, run retrieval, and await resume", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerRunRoutes(app);

    const agents = await app.inject({
      method: "GET",
      url: "/agents"
    });

    expect(agents.statusCode).toBe(200);
    expect(agents.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "intake-agent" })
      ])
    );

    const created = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "await",
        label: "approval-needed",
        prompt: "Proceed?",
        actions: ["approve", "reject"]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe("awaiting");
    expect(created.json().recoveryState).toBe("healthy");
    expect(created.json().recoveryReason).toBeUndefined();
    expect(created.json().id).toEqual(expect.any(String));
    expect(created.json().runId).toBeUndefined();

    const runId = created.json().id;
    const retrieved = await app.inject({
      method: "GET",
      url: `/runs/${runId}`
    });

    expect(retrieved.statusCode).toBe(200);
    expect(retrieved.json().id).toBe(runId);
    expect(retrieved.json()).toEqual(created.json());

    const resumed = await app.inject({
      method: "POST",
      url: `/runs/${runId}`,
      payload: {
        role: "user",
        content: "approve"
      }
    });

    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().status).toBe("completed");
    expect(resumed.json().recoveryState).toBe("healthy");
    expect(resumed.json().recoveryReason).toBeUndefined();
    expect(resumed.json().messages.at(-1)).toEqual({
      role: "user",
      content: "approve"
    });
  });

  it("rejects agent-run requests when no worker runner is wired", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "agent-run",
        agent: "analyst-agent",
        messages: [{ role: "user", content: "plan this task" }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Unsupported run kind: agent-run"
    });
  });

  it("accepts agent-run requests when a worker runner is wired", async () => {
    const app = Fastify();
    registerRunRoutes(app, {
      runAgent: async (payload) => ({
        id: "run-agent-1",
        agent: payload.agent,
        status: "completed",
        messages: payload.messages,
        artifacts: []
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "agent-run",
        agent: "analyst-agent",
        messages: [{ role: "user", content: "plan this task" }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: "run-agent-1",
        agent: "analyst-agent",
        status: "completed",
        messages: [{ role: "user", content: "plan this task" }],
        artifacts: [],
        recoveryState: "healthy"
      })
    );
    expect(response.json().recoveryReason).toBeUndefined();
  });

  it("persists a failed run when the worker runner throws", async () => {
    const app = Fastify();
    registerRunRoutes(app, {
      runAgent: async () => {
        throw new Error("runner exploded");
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "agent-run",
        agent: "analyst-agent",
        messages: [{ role: "user", content: "plan this task" }]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(
      expect.objectContaining({
        agent: "analyst-agent",
        status: "failed",
        artifacts: [],
        recoveryState: "healthy"
      })
    );
    expect(response.json().recoveryReason).toBeUndefined();
  });

  it("returns 500 when persistence fails after a successful agent run", async () => {
    const store = {
      async getRun() {
        return undefined;
      },
      async saveRun(run) {
        if (run.status === "completed") {
          throw new Error("database unavailable");
        }

        return {
          ...run,
          recoveryState: "healthy",
          latestEventId: 2,
          latestProjectionVersion: 2
        };
      }
    } satisfies GatewayRunStore;
    const app = Fastify();
    registerRunRoutes(app, {
      store,
      runAgent: async (payload) => ({
        id: "run-agent-2",
        agent: payload.agent,
        status: "completed",
        messages: payload.messages,
        artifacts: []
      })
    });

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "agent-run",
        agent: "analyst-agent",
        messages: [{ role: "user", content: "plan this task" }]
      }
    });

    expect(response.statusCode).toBe(500);
  });

  it("returns 404 when a run cannot be found", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const response = await app.inject({
      method: "GET",
      url: "/runs/missing-run"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Run not found" });
  });

  it("returns 409 when resuming a missing run", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/runs/missing-run",
      payload: {
        role: "user",
        content: "approve"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "Run is not awaiting input"
    });
  });

  it("returns 409 when resuming a non-awaiting run", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const created = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "await",
        label: "approval-needed",
        prompt: "Proceed?",
        actions: ["approve", "reject"]
      }
    });

    await app.inject({
      method: "POST",
      url: `/runs/${created.json().id}`,
      payload: {
        role: "user",
        content: "approve"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/runs/${created.json().id}`,
      payload: {
        role: "user",
        content: "approve"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "Run is not awaiting input"
    });
  });

  it("returns 409 when a resume hits an event version conflict", async () => {
    const store = {
      async getRun() {
        return {
          id: "run-race",
          agent: "approval-needed",
          status: "awaiting",
          messages: [],
          artifacts: [],
          awaitPrompt: "Proceed?",
          allowedActions: ["approve", "reject"],
          recoveryState: "healthy" as const,
          latestEventId: 2,
          latestProjectionVersion: 2
        };
      },
      async saveRun() {
        throw new Error("Event version mismatch for run:run-race");
      }
    } satisfies GatewayRunStore;
    const app = Fastify();
    registerRunRoutes(app, { store });

    const response = await app.inject({
      method: "POST",
      url: "/runs/run-race",
      payload: {
        role: "user",
        content: "approve"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: "Run state changed, retry the request"
    });
  });

  it("returns 400 for unsupported approval actions", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const created = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "await",
        label: "approval-needed",
        prompt: "Proceed?",
        actions: ["approve", "reject"]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/runs/${created.json().id}`,
      payload: {
        role: "user",
        content: "defer"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Unsupported approval action: defer"
    });
  });

  it("returns 400 for invalid agent-run payloads", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "agent-run",
        agent: "analyst-agent",
        messages: [{ role: "system", content: "bad role" }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("Invalid run payload");
  });

  it("returns 400 for invalid await response payloads", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const created = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "await",
        label: "approval-needed",
        prompt: "Proceed?",
        actions: ["approve", "reject"]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/runs/${created.json().id}`,
      payload: {
        role: "agent/intake-agent",
        content: "approve"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("Invalid await response payload");
  });

  it("persists taskId from await metadata", async () => {
    const app = Fastify();
    registerRunRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "await",
        label: "approval-gate",
        prompt: "Proceed?",
        actions: ["approve", "reject"],
        metadata: {
          taskId: "task-1"
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().taskId).toBe("task-1");
  });
});
