import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { TaskRecordSchema } from "@feudal/contracts";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { registerOperatorActionRoutes } from "./operator-actions";
import { createOrchestratorService } from "../services/orchestrator-service";
import { createTaskRunGateway } from "../services/task-run-gateway";
import { MemoryTaskStore } from "../store";

function buildStoredTask(
  overrides: Partial<ReturnType<typeof TaskRecordSchema.parse>> = {}
) {
  return TaskRecordSchema.parse({
    id: "task-route-operator",
    title: "Recover executor",
    prompt: "Retry the deployment",
    status: "failed",
    artifacts: [
      {
        id: "artifact-taskspec",
        kind: "taskspec",
        name: "taskspec.json",
        mimeType: "application/json",
        content: { prompt: "Retry the deployment" }
      }
    ],
    history: [],
    runIds: [],
    runs: [],
    operatorAllowedActions: ["recover", "takeover", "abandon"],
    governance: {
      requestedRequiresApproval: true,
      effectiveRequiresApproval: true,
      allowMock: false,
      sensitivity: "medium",
      executionMode: "real",
      policyReasons: [],
      reviewVerdict: "approved",
      allowedActions: [],
      revisionCount: 0
    },
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:05:00.000Z",
    ...overrides
  });
}

async function createOperatorApp() {
  const store = new MemoryTaskStore();
  await store.saveTask(buildStoredTask(), "task.execution_failed", 0);

  const service = createOrchestratorService({
    runGateway: createTaskRunGateway({
      realClient: createMockACPClient(),
      mockClient: createMockACPClient()
    }),
    store
  });
  const app = Fastify();
  registerOperatorActionRoutes(app, service);
  return { app, store };
}

describe("operator action routes", () => {
  it("recovers failed tasks through dedicated operator endpoints", async () => {
    const { app } = await createOperatorApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/task-route-operator/operator-actions/recover",
      payload: {
        note: "Executor restored; retry the run."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("completed");
  });

  it("returns 400 for missing operator note", async () => {
    const { app } = await createOperatorApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/task-route-operator/operator-actions/recover",
      payload: {
        note: "   "
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 when abandon is missing confirmation", async () => {
    const { app } = await createOperatorApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/task-route-operator/operator-actions/abandon",
      payload: {
        note: "Stop this branch."
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 404 when the task does not exist", async () => {
    const { app } = await createOperatorApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/missing-task/operator-actions/recover",
      payload: {
        note: "Retry"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Task not found" });
  });

  it("returns operator history and queue summary", async () => {
    const { app } = await createOperatorApp();

    await app.inject({
      method: "POST",
      url: "/api/tasks/task-route-operator/operator-actions/abandon",
      payload: {
        note: "Stop this branch.",
        confirm: true
      }
    });

    const history = await app.inject({
      method: "GET",
      url: "/api/tasks/task-route-operator/operator-actions"
    });
    const summary = await app.inject({
      method: "GET",
      url: "/api/operator-actions/summary"
    });

    expect(history.statusCode).toBe(200);
    expect(history.json()[0].actionType).toBe("abandon");
    expect(summary.statusCode).toBe(200);
    expect(summary.json().tasksNeedingOperatorAttention).toBeGreaterThanOrEqual(0);
  });
});
