import { describe, expect, it, vi } from "vitest";
import type {
  ACPAwaitExternalInput,
  ACPClient,
  ACPRunAgentInput
} from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { TaskRecordSchema } from "@feudal/contracts";
import { createTaskRunGateway } from "./task-run-gateway";
import { createOrchestratorService } from "./orchestrator-service";
import { MemoryTaskStore } from "../store";

class RecordingTaskStore extends MemoryTaskStore {
  constructor(private readonly eventLog: string[]) {
    super();
  }

  override async saveTask(task, eventType, expectedVersion) {
    this.eventLog.push(`save:${eventType}:${task.status}:${expectedVersion}`);
    return super.saveTask(task, eventType, expectedVersion);
  }
}

function createRecordingACPClient(events: string[]): ACPClient {
  const base = createMockACPClient();

  return {
    ...base,
    async runAgent(input: ACPRunAgentInput) {
      events.push(`run:${input.agent}`);
      return base.runAgent(input);
    },
    async awaitExternalInput(input: ACPAwaitExternalInput) {
      events.push(`await:${input.label}`);
      return base.awaitExternalInput(input);
    },
    async respondToAwait(runId, response) {
      events.push(`respond:${runId}:${response.content}`);
      return base.respondToAwait(runId, response);
    }
  };
}

function createServiceWithGateway(options?: {
  realClient?: ACPClient;
  store?: MemoryTaskStore;
}) {
  return createOrchestratorService({
    runGateway: createTaskRunGateway({
      realClient: options?.realClient ?? createMockACPClient(),
      mockClient: createMockACPClient()
    }),
    store: options?.store
  });
}

function buildStoredTask(
  overrides: Partial<ReturnType<typeof TaskRecordSchema.parse>> = {}
) {
  return TaskRecordSchema.parse({
    id: "task-operator-service",
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

describe("orchestrator service durability", () => {
  it("completes directly when approval is not required and sensitivity is low", async () => {
    const service = createServiceWithGateway();

    const created = await service.createTask({
      id: "task-low-no-approval",
      title: "Low-risk task",
      prompt: "Run straight through execution",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "low"
    });

    expect(created.status).toBe("completed");
    expect(created.approvalRequest).toBeUndefined();
    expect(created.governance?.effectiveRequiresApproval).toBe(false);
    expect(created.governance?.allowedActions).toEqual([]);
  });

  it("forces approval for high sensitivity even when requiresApproval is false", async () => {
    const service = createServiceWithGateway();

    const created = await service.createTask({
      id: "task-high-forced-approval",
      title: "High-risk task",
      prompt: "Must stop at governance gate",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "high"
    });

    expect(created.status).toBe("awaiting_approval");
    expect(created.approvalRequest).toBeDefined();
    expect(created.governance?.effectiveRequiresApproval).toBe(true);
    expect(created.governance?.allowedActions).toEqual(["approve", "reject"]);
    expect(created.governance?.policyReasons).toContain(
      "high sensitivity forced approval"
    );
  });

  it("latches mock fallback on real failure and supports revision re-entry", async () => {
    const failingRealClient: ACPClient = {
      ...createMockACPClient(),
      async runAgent() {
        throw new Error("real ACP unavailable");
      }
    };
    const service = createServiceWithGateway({
      realClient: failingRealClient
    });

    const created = await service.createTask({
      id: "task-fallback-revision",
      title: "Fallback revision flow",
      prompt: "Review this task #mock:needs_revision-once",
      allowMock: true,
      requiresApproval: true,
      sensitivity: "medium"
    });

    expect(created.status).toBe("needs_revision");
    expect(created.governance?.executionMode).toBe("mock_fallback_used");
    expect(created.governance?.reviewVerdict).toBe("needs_revision");
    expect(created.governance?.allowedActions).toEqual(["revise"]);
    expect(created.revisionRequest?.note).toBeDefined();

    const revised = await service.submitRevision(
      created.id,
      "Addressed reviewer feedback and added rollback details."
    );

    expect(revised.status).toBe("awaiting_approval");
    expect(revised.governance?.executionMode).toBe("mock_fallback_used");
    expect(revised.governance?.revisionCount).toBe(1);
    expect(revised.governance?.reviewVerdict).toBe("approved");
    expect(revised.governance?.allowedActions).toEqual(["approve", "reject"]);
    expect(revised.revisionRequest).toBeUndefined();
  });

  it("uses createTaskRunGatewayFromEnv to run allowMock=false tasks in mock mode", async () => {
    const originalMode = process.env.FEUDAL_ACP_MODE;

    process.env.FEUDAL_ACP_MODE = "mock";
    vi.resetModules();

    try {
      const { createTaskRunGatewayFromEnv } = await import("../config");
      const service = createOrchestratorService({
        runGateway: createTaskRunGatewayFromEnv()
      });

      const created = await service.createTask({
        id: "task-config-mock-mode",
        title: "Config mock mode task",
        prompt: "Run through the default mock gateway",
        allowMock: false,
        requiresApproval: false,
        sensitivity: "low"
      });

      expect(created.status).toBe("completed");
      expect(created.governance?.executionMode).toBe("real");
    } finally {
      if (originalMode === undefined) {
        delete process.env.FEUDAL_ACP_MODE;
      } else {
        process.env.FEUDAL_ACP_MODE = originalMode;
      }
      vi.resetModules();
    }
  });

  it("passes taskId metadata into every ACP run created for a task", async () => {
    const metadataLog: string[] = [];
    const base = createMockACPClient();
    const acpClient: ACPClient = {
      ...base,
      async runAgent(input: ACPRunAgentInput) {
        metadataLog.push(`${input.agent}:${input.metadata?.taskId as string | undefined}`);
        return base.runAgent(input);
      },
      async awaitExternalInput(input: ACPAwaitExternalInput) {
        const inputWithMetadata = input as ACPAwaitExternalInput & {
          metadata?: { taskId?: string };
        };
        metadataLog.push(`${input.label}:${inputWithMetadata.metadata?.taskId}`);
        return base.awaitExternalInput(input);
      }
    };

    const service = createOrchestratorService({
      runGateway: createTaskRunGateway({
        realClient: acpClient,
        mockClient: createMockACPClient()
      })
    });
    const created = await service.createTask({
      id: "task-metadata",
      title: "Metadata task",
      prompt: "Thread metadata through all runs",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    await service.approveTask(created.id);

    expect(metadataLog).toEqual([
      "intake-agent:task-metadata",
      "analyst-agent:task-metadata",
      "auditor-agent:task-metadata",
      "critic-agent:task-metadata",
      "approval-gate:task-metadata",
      "gongbu-executor:task-metadata",
      "xingbu-verifier:task-metadata"
    ]);
  });

  it("persists task state before opening the approval gate", async () => {
    const events: string[] = [];
    const service = createOrchestratorService({
      runGateway: createTaskRunGateway({
        realClient: createRecordingACPClient(events),
        mockClient: createMockACPClient()
      }),
      store: new RecordingTaskStore(events)
    });

    await service.createTask({
      id: "task-durable-create",
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    const firstSaveIndex = events.findIndex((event) => event.startsWith("save:"));
    const awaitIndex = events.findIndex((event) => event.startsWith("await:"));

    expect(firstSaveIndex).toBeGreaterThanOrEqual(0);
    expect(awaitIndex).toBeGreaterThan(firstSaveIndex);
  });

  it("persists approval consumption before starting execution", async () => {
    const events: string[] = [];
    const service = createOrchestratorService({
      runGateway: createTaskRunGateway({
        realClient: createRecordingACPClient(events),
        mockClient: createMockACPClient()
      }),
      store: new RecordingTaskStore(events)
    });

    const created = await service.createTask({
      id: "task-durable-approve",
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    events.length = 0;

    await service.approveTask(created.id);

    const respondIndex = events.findIndex((event) => event.startsWith("respond:"));
    const firstSaveIndex = events.findIndex((event) => event.startsWith("save:"));
    const executeIndex = events.findIndex((event) => event === "run:gongbu-executor");

    expect(respondIndex).toBeGreaterThanOrEqual(0);
    expect(firstSaveIndex).toBeGreaterThan(respondIndex);
    expect(executeIndex).toBeGreaterThan(firstSaveIndex);
  });

  it("persists rejection consumption without starting execution", async () => {
    const events: string[] = [];
    const service = createOrchestratorService({
      runGateway: createTaskRunGateway({
        realClient: createRecordingACPClient(events),
        mockClient: createMockACPClient()
      }),
      store: new RecordingTaskStore(events)
    });

    const created = await service.createTask({
      id: "task-durable-reject",
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    events.length = 0;

    await service.rejectTask(created.id);

    const respondIndex = events.findIndex((event) => event.startsWith("respond:"));
    const firstSaveIndex = events.findIndex((event) => event.startsWith("save:"));
    const executeIndex = events.findIndex((event) => event === "run:gongbu-executor");

    expect(respondIndex).toBeGreaterThanOrEqual(0);
    expect(firstSaveIndex).toBeGreaterThan(respondIndex);
    expect(executeIndex).toBe(-1);
    expect(events.some((event) => event.startsWith("save:task.rejected:rejected:"))).toBe(
      true
    );
  });

  it("recovers failed tasks and records applied recover actions", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(buildStoredTask(), "task.execution_failed", 0);

    const service = createServiceWithGateway({ store });
    const recovered = await service.recoverTask(
      "task-operator-service",
      "Executor restored; retry the run."
    );

    expect(recovered.status).toBe("completed");
    await expect(store.listOperatorActions("task-operator-service")).resolves.toContainEqual(
      expect.objectContaining({
        actionType: "recover",
        status: "applied",
        note: "Executor restored; retry the run."
      })
    );
  });

  it("takes over awaiting approval tasks and re-enters planning with a fresh approval gate", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(
      buildStoredTask({
        status: "awaiting_approval",
        approvalRunId: "run-approval-old",
        approvalRequest: {
          runId: "run-approval-old",
          prompt: "Approve the decision brief?",
          actions: ["approve", "reject"]
        },
        operatorAllowedActions: ["takeover", "abandon"]
      }),
      "task.awaiting_approval",
      0
    );

    const service = createServiceWithGateway({ store });
    const takenOver = await service.takeoverTask(
      "task-operator-service",
      "Re-plan around the new rollback constraints."
    );

    expect(takenOver.status).toBe("awaiting_approval");
    expect(takenOver.approvalRunId).not.toBe("run-approval-old");
    expect(takenOver.approvalRequest?.actions).toEqual(["approve", "reject"]);
    expect(
      takenOver.history.some((entry) => entry.note.includes("Operator takeover note"))
    ).toBe(true);
  });

  it("abandons actionable tasks and clears follow-up actions", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(
      buildStoredTask({
        status: "review",
        operatorAllowedActions: ["abandon"]
      }),
      "task.review_completed",
      0
    );

    const service = createServiceWithGateway({ store });
    const abandoned = await service.abandonTask(
      "task-operator-service",
      "Stop work on this branch.",
      true
    );

    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.operatorAllowedActions).toEqual([]);
  });

  it("rejects operator actions that are not currently allowed", async () => {
    const store = new MemoryTaskStore();
    await store.saveTask(
      buildStoredTask({
        status: "completed",
        operatorAllowedActions: []
      }),
      "task.completed",
      0
    );

    const service = createServiceWithGateway({ store });

    await expect(
      service.recoverTask("task-operator-service", "Retry anyway")
    ).rejects.toThrow("does not allow recover");
  });
});
