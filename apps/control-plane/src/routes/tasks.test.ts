import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { ACPClient, ACPRunAgentInput } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { registerTaskRoutes } from "./tasks";
import { registerAgentRoutes } from "./agents";
import { createOrchestratorService } from "../services/orchestrator-service";

function createApp() {
  const service = createOrchestratorService({
    acpClient: createMockACPClient()
  });
  const app = Fastify();
  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);
  return app;
}

function createAppWithClient(acpClient: ACPClient) {
  const service = createOrchestratorService({ acpClient });
  const app = Fastify();
  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);
  return app;
}

function createExecutorFlakyClient(failuresBeforeSuccess: number) {
  const base = createMockACPClient();
  let attempts = 0;

  return {
    client: {
      ...base,
      async runAgent(input: ACPRunAgentInput) {
        if (input.agent === "gongbu-executor") {
          attempts += 1;

          if (attempts <= failuresBeforeSuccess) {
            throw new Error("executor failed");
          }
        }

        return base.runAgent(input);
      }
    } satisfies ACPClient,
    getAttempts: () => attempts
  };
}

describe("control-plane routes", () => {
  it("returns ACP run summaries and approval prompt data on task creation", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: true,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("awaiting_approval");
    expect(response.json().runs.length).toBeGreaterThan(0);
    expect(response.json().approvalRequest.prompt).toContain("Approve");
    expect(response.json().approvalRequest.actions).toEqual(["approve", "reject"]);
  });

  it("approves a task and drives it to completion", async () => {
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: true,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    const taskId = created.json().id;
    const approval = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approve`
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json().status).toBe("completed");
    expect(approval.json().approvalRunId).toBeUndefined();
    expect(approval.json().approvalRequest).toBeUndefined();
    expect(approval.json().runs.map((run: { phase: string }) => run.phase)).toEqual([
      "intake",
      "planning",
      "review",
      "review",
      "approval",
      "execution",
      "verification"
    ]);
    expect(
      approval.json().runs.find((run: { phase: string }) => run.phase === "approval")
        ?.status
    ).toBe("completed");
  });

  it("returns 404 when approving an unknown task", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerTaskRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/missing-task/approve"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Task not found" });
  });

  it("retries the executor once before completing the task", async () => {
    const flaky = createExecutorFlakyClient(1);
    const app = createAppWithClient(flaky.client);

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

    const approval = await app.inject({
      method: "POST",
      url: `/api/tasks/${created.json().id}/approve`
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json().status).toBe("completed");
    expect(flaky.getAttempts()).toBe(2);
  });

  it("persists a failed task if the executor fails twice", async () => {
    const flaky = createExecutorFlakyClient(2);
    const app = createAppWithClient(flaky.client);

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

    const approval = await app.inject({
      method: "POST",
      url: `/api/tasks/${created.json().id}/approve`
    });

    expect(approval.statusCode).toBe(200);
    expect(approval.json().status).toBe("failed");
    expect(approval.json().approvalRunId).toBeUndefined();
    expect(approval.json().approvalRequest).toBeUndefined();
    expect(flaky.getAttempts()).toBe(2);
    expect(approval.json().runs.map((run: { phase: string }) => run.phase)).toEqual([
      "intake",
      "planning",
      "review",
      "review",
      "approval"
    ]);
    expect(
      approval.json().runs.find((run: { phase: string }) => run.phase === "approval")
        ?.status
    ).toBe("completed");
  });
});
