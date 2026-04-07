import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { registerOperatorActionRoutes } from "./operator-actions";
import { registerTaskRoutes } from "./tasks";
import { createControlPlaneApp } from "../server";
import { createOrchestratorService } from "../services/orchestrator-service";
import { createTaskRunGateway } from "../services/task-run-gateway";

function createApp() {
  const service = createOrchestratorService({
    runGateway: createTaskRunGateway({
      realClient: createMockACPClient(),
      mockClient: createMockACPClient()
    })
  });
  const app = Fastify({ logger: false });
  registerTaskRoutes(app, service);
  registerOperatorActionRoutes(app, service);
  return app;
}

describe("operator action routes", () => {
  it("returns operator history for an existing task", async () => {
    const app = createApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Operator history task",
        prompt: "Exercise operator history",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    const taskId = created.json().id;

    await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/operator-actions/takeover`,
      payload: { note: "Re-plan this task." }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/operator-actions`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionType: "takeover", status: "requested" }),
        expect.objectContaining({ actionType: "takeover", status: "applied" })
      ])
    );
  });

  it("returns 400 for abandon without confirmation", async () => {
    const app = createApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Abandon confirmation task",
        prompt: "Require confirmation",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${created.json().id}/operator-actions/abandon`,
      payload: { note: "Stop this task.", confirm: false }
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 404 when acting on an unknown task", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/missing-task/operator-actions/takeover",
      payload: { note: "Re-plan this task." }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Task not found" });
  });

  it("returns 404 when listing operator history for an unknown task", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/tasks/missing-task/operator-actions"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Task not found" });
  });

  it("returns 409 when an operator action is not allowed", async () => {
    const app = createApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Disallowed recover task",
        prompt: "Create a task that has not failed yet",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${created.json().id}/operator-actions/recover`,
      payload: { note: "Retry execution now." }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: expect.stringContaining("does not allow operator action recover")
    });
  });

  it("returns operator summary for recovery attention", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/operator-actions/summary"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        tasksNeedingOperatorAttention: expect.any(Number),
        tasks: expect.any(Array)
      })
    );
  });

  it("wires operator routes into the control-plane app", async () => {
    const service = createOrchestratorService({
      runGateway: createTaskRunGateway({
        realClient: createMockACPClient(),
        mockClient: createMockACPClient()
      })
    });
    const app = createControlPlaneApp({
      logger: false,
      service
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/operator-actions/summary"
    });

    expect(response.statusCode).toBe(200);
  });
});
