import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { ACPClient, ACPRunAgentInput } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { TaskRecordSchema } from "@feudal/contracts";
import { registerTaskRoutes } from "./tasks";
import { registerAgentRoutes } from "./agents";
import { buildTaskEventInputs } from "../persistence/task-event-codec";
import { createTaskReadModel } from "../persistence/task-read-model";
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
  it("returns recovery and event metadata on task creation", async () => {
    const app = createAppWithClient(createMockACPClient());

    const response = await app.inject({
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

    expect(response.statusCode).toBe(201);
    expect(response.json().recoveryState).toBe("healthy");
    expect(response.json().latestEventId).toBeGreaterThan(0);
    expect(response.json().latestProjectionVersion).toBeGreaterThan(0);
  });

  it("keeps the latest event version after rebuilding projections", async () => {
    const task = TaskRecordSchema.parse({
      id: "task-rebuild",
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      status: "awaiting_approval",
      artifacts: [],
      history: [],
      runIds: ["run-approval"],
      approvalRunId: "run-approval",
      runs: [],
      approvalRequest: {
        runId: "run-approval",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"]
      },
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    });
    const [businessEvent, diffEvent] = buildTaskEventInputs(task, "task.created");
    const rows = new Map<
      string,
      {
        recovery_state: string;
        recovery_reason: string | null;
        last_recovered_at: string;
        latest_event_id: number;
        latest_projection_version: number;
        payload_json: unknown;
      }
    >();
    let checkpoint: number | undefined;
    const eventStore = {
      async readCheckpoint() {
        return checkpoint;
      },

      async loadAfter() {
        return [
          {
            id: 1,
            streamType: "task",
            streamId: task.id,
            eventType: businessEvent.eventType,
            eventVersion: 1,
            occurredAt: task.updatedAt,
            payloadJson: businessEvent.payloadJson,
            metadataJson: businessEvent.metadataJson
          },
          {
            id: 2,
            streamType: "task",
            streamId: task.id,
            eventType: diffEvent.eventType,
            eventVersion: 2,
            occurredAt: task.updatedAt,
            payloadJson: diffEvent.payloadJson,
            metadataJson: diffEvent.metadataJson
          }
        ];
      },

      async writeCheckpoint(_projectionName: string, lastEventId: number) {
        checkpoint = lastEventId;
      },

      async withTransaction<T>(
        work: (tx: {
          query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
        }) => Promise<T>
      ) {
        const tx = {
          query: async (sql: string, values: unknown[] = []) => {
            if (sql.includes("insert into tasks_current")) {
              rows.set(String(values[0]), {
                recovery_state: String(values[4]),
                recovery_reason: (values[5] as string | null | undefined) ?? null,
                last_recovered_at: String(values[6]),
                latest_event_id: Number(values[7]),
                latest_projection_version: Number(values[8]),
                payload_json: values[9]
              });
              return { rows: [] };
            }

            if (sql.includes("select recovery_state")) {
              const taskId = values[0] as string | undefined;
              const row = taskId ? rows.get(taskId) : undefined;
              return { rows: row ? [row] : [] };
            }

            throw new Error(`Unexpected SQL: ${sql}`);
          }
        };

        return work(tx);
      }
    };
    const readModel = createTaskReadModel({
      eventStore: eventStore as Parameters<typeof createTaskReadModel>[0]["eventStore"]
    });

    await readModel.rebuildProjectionsIfNeeded();

    const rebuilt = await readModel.getTask(task.id);

    expect(rebuilt?.latestEventId).toBe(2);
    expect(rebuilt?.latestProjectionVersion).toBe(2);
  });

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
