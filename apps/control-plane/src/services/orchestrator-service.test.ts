import { describe, expect, it, vi } from "vitest";
import type {
  ACPAwaitExternalInput,
  ACPClient,
  ACPRunAgentInput
} from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createTaskRunGateway } from "./task-run-gateway";
import { createOrchestratorService } from "./orchestrator-service";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
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

class StaleRecoveryTaskStore extends MemoryTaskStore {
  override async getTask(taskId: string) {
    if (taskId !== "task-stale-recovery") {
      return super.getTask(taskId);
    }

    return {
      id: taskId,
      title: "Stale recovery task",
      prompt: "Resume the stale recovery task",
      status: "executing",
      artifacts: [],
      history: [
        {
          status: "executing",
          at: "2026-04-05T00:00:00.000Z",
          note: "Recovered executing task requires operator review"
        }
      ],
      runIds: [],
      runs: [],
      operatorAllowedActions: [],
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
      recoveryState: "recovery_required",
      recoveryReason: "Recovered executing task requires operator review",
      latestEventId: 0,
      latestProjectionVersion: 0
    } satisfies TaskProjectionRecord;
  }
}

class FailingRecoverPersistStore extends MemoryTaskStore {
  override async saveTask(task, eventType, expectedVersion) {
    if (eventType === "task.operator_recovered") {
      throw new Error("simulated save failure");
    }

    return super.saveTask(task, eventType, expectedVersion);
  }
}

class MismatchedApprovalTaskStore extends MemoryTaskStore {
  override async getTask(taskId: string) {
    if (taskId !== "task-mismatch") {
      return super.getTask(taskId);
    }

    return {
      id: taskId,
      title: "Mismatched approval task",
      prompt: "Approve the mismatched task",
      status: "awaiting_approval",
      artifacts: [],
      history: [
        {
          status: "awaiting_approval",
          at: "2026-04-07T00:00:00.000Z",
          note: "review.approved"
        }
      ],
      runIds: ["run-approval"],
      approvalRunId: "run-approval",
      runs: [
        {
          id: "run-approval",
          agent: "approval-gate",
          status: "awaiting",
          phase: "approval",
          awaitPrompt: "Approve the decision brief?",
          allowedActions: ["reject"]
        }
      ],
      approvalRequest: {
        runId: "run-approval",
        prompt: "Approve the decision brief?",
        actions: ["reject"]
      },
      governance: {
        requestedRequiresApproval: true,
        effectiveRequiresApproval: true,
        allowMock: false,
        sensitivity: "medium",
        executionMode: "real",
        policyReasons: [],
        reviewVerdict: "approved",
        allowedActions: ["approve", "reject"],
        revisionCount: 0
      },
      operatorAllowedActions: ["abandon"],
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
      recoveryState: "healthy",
      latestEventId: 1,
      latestProjectionVersion: 1
    } satisfies TaskProjectionRecord;
  }
}

class GovernanceDisallowApprovalTaskStore extends MemoryTaskStore {
  override async getTask(taskId: string) {
    if (taskId !== "task-governance-disallow") {
      return super.getTask(taskId);
    }

    return {
      id: taskId,
      title: "Governance disallow task",
      prompt: "Approve despite governance drift",
      status: "awaiting_approval",
      artifacts: [],
      history: [
        {
          status: "awaiting_approval",
          at: "2026-04-07T00:00:00.000Z",
          note: "review.approved"
        }
      ],
      runIds: ["run-approval"],
      approvalRunId: "run-approval",
      runs: [
        {
          id: "run-approval",
          agent: "approval-gate",
          status: "awaiting",
          phase: "approval",
          awaitPrompt: "Approve the decision brief?",
          allowedActions: ["approve", "reject"]
        }
      ],
      approvalRequest: {
        runId: "run-approval",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"]
      },
      governance: {
        requestedRequiresApproval: true,
        effectiveRequiresApproval: true,
        allowMock: false,
        sensitivity: "medium",
        executionMode: "real",
        policyReasons: [],
        reviewVerdict: "approved",
        allowedActions: ["reject"],
        revisionCount: 0
      },
      operatorAllowedActions: ["abandon"],
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
      recoveryState: "healthy",
      latestEventId: 1,
      latestProjectionVersion: 1
    } satisfies TaskProjectionRecord;
  }
}

class EmptyGovernanceActionsCompatStore extends MemoryTaskStore {
  override async getTask(taskId: string) {
    const task = await super.getTask(taskId);

    if (!task || taskId !== "task-legacy-empty-governance") {
      return task;
    }

    return {
      ...task,
      governance: task.governance
        ? {
            ...task.governance,
            allowedActions: []
          }
        : task.governance
    } satisfies TaskProjectionRecord;
  }
}

class MissingApprovalRequestCompatStore extends MemoryTaskStore {
  override async getTask(taskId: string) {
    const task = await super.getTask(taskId);

    if (!task || taskId !== "task-legacy-missing-approval-request") {
      return task;
    }

    return {
      ...task,
      approvalRequest: undefined
    } satisfies TaskProjectionRecord;
  }
}

class StaleApprovalStateTaskStore extends MemoryTaskStore {
  override async getTask(taskId: string) {
    if (taskId !== "task-stale-approval-state") {
      return super.getTask(taskId);
    }

    return {
      id: taskId,
      title: "Stale approval state task",
      prompt: "Reject stale approval state",
      status: "executing",
      artifacts: [],
      history: [
        {
          status: "executing",
          at: "2026-04-07T00:00:00.000Z",
          note: "task.execution_started"
        }
      ],
      runIds: ["run-stale-approval"],
      approvalRunId: "run-stale-approval",
      runs: [
        {
          id: "run-stale-approval",
          agent: "approval-gate",
          status: "awaiting",
          phase: "approval",
          awaitPrompt: "Approve the decision brief?",
          allowedActions: ["approve", "reject"]
        }
      ],
      approvalRequest: {
        runId: "run-stale-approval",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"]
      },
      governance: {
        requestedRequiresApproval: true,
        effectiveRequiresApproval: true,
        allowMock: false,
        sensitivity: "medium",
        executionMode: "real",
        policyReasons: [],
        reviewVerdict: "approved",
        allowedActions: ["approve", "reject"],
        revisionCount: 0
      },
      operatorAllowedActions: ["abandon"],
      createdAt: "2026-04-07T00:00:00.000Z",
      updatedAt: "2026-04-07T00:00:00.000Z",
      recoveryState: "healthy",
      latestEventId: 1,
      latestProjectionVersion: 1
    } satisfies TaskProjectionRecord;
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

  it("submits approve and revise through the unified governance dispatcher", async () => {
    const service = createServiceWithGateway();
    const approvalTask = await service.createTask({
      id: "task-governance-approve",
      title: "Approval task",
      prompt: "Approve this task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    const approved = await service.submitGovernanceAction(
      approvalTask.id,
      "approve"
    );

    expect(approved.status).toBe("completed");

    const revisionTask = await service.createTask({
      id: "task-governance-revise",
      title: "Revision task",
      prompt: "Exercise governance #mock:needs_revision-once",
      allowMock: true,
      requiresApproval: false,
      sensitivity: "high"
    });

    const revised = await service.submitGovernanceAction(
      revisionTask.id,
      "revise",
      "Tighten rollback scope and re-run review."
    );

    expect(revised.status).toBe("awaiting_approval");
    expect(revised.governance?.revisionCount).toBe(1);
  });

  it("rejects approval actions when approvalRequest.actions drift from governance.allowedActions", async () => {
    const service = createServiceWithGateway({
      store: new MismatchedApprovalTaskStore()
    });

    await expect(
      service.submitGovernanceAction("task-mismatch", "approve")
    ).rejects.toThrow("Task task-mismatch does not allow approve");
  });

  it("rejects approval actions when stored governance.allowedActions disallows approve", async () => {
    const service = createServiceWithGateway({
      store: new GovernanceDisallowApprovalTaskStore()
    });

    await expect(
      service.submitGovernanceAction("task-governance-disallow", "approve")
    ).rejects.toThrow("Task task-governance-disallow does not allow approve");
  });

  it("allows approval compatibility path when governance.allowedActions is the legacy empty default", async () => {
    const service = createServiceWithGateway({
      store: new EmptyGovernanceActionsCompatStore()
    });
    const created = await service.createTask({
      id: "task-legacy-empty-governance",
      title: "Legacy empty governance action task",
      prompt: "Approve despite empty governance actions",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    const approved = await service.submitGovernanceAction(created.id, "approve");

    expect(approved.status).toBe("completed");
  });

  it("allows approval compatibility path when approvalRequest metadata is missing", async () => {
    const service = createServiceWithGateway({
      store: new MissingApprovalRequestCompatStore()
    });
    const created = await service.createTask({
      id: "task-legacy-missing-approval-request",
      title: "Legacy missing approval request task",
      prompt: "Approve despite missing approval request",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    const approved = await service.submitGovernanceAction(created.id, "approve");

    expect(approved.status).toBe("completed");
  });

  it("rejects stale non-awaiting approval tasks before attempting respondToAwait", async () => {
    const events: string[] = [];
    const service = createOrchestratorService({
      runGateway: createTaskRunGateway({
        realClient: createRecordingACPClient(events),
        mockClient: createMockACPClient()
      }),
      store: new StaleApprovalStateTaskStore()
    });

    await expect(
      service.submitGovernanceAction("task-stale-approval-state", "approve")
    ).rejects.toThrow("Task task-stale-approval-state is not awaiting approval");
    expect(events.some((event) => event.startsWith("respond:"))).toBe(false);
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
});

describe("orchestrator service operator actions", () => {
  it("recovers a failed task and records requested/applied operator history", async () => {
    const store = new MemoryTaskStore();
    const failingClient: ACPClient = {
      ...createMockACPClient(),
      async runAgent(input) {
        if (input.agent === "gongbu-executor") {
          throw new Error("executor unavailable");
        }

        return createMockACPClient().runAgent(input);
      }
    };
    const failingService = createServiceWithGateway({
      realClient: failingClient,
      store
    });

    const failed = await failingService.createTask({
      id: "task-recover",
      title: "Recover executor",
      prompt: "Retry execution",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "low"
    });

    expect(failed.status).toBe("failed");

    const recovered = await createServiceWithGateway({ store }).recoverTask(
      failed.id,
      "Retry after restoring the executor."
    );

    expect(recovered.status).toBe("completed");
    await expect(store.listOperatorActions(failed.id)).resolves.toEqual([
      expect.objectContaining({ actionType: "recover", status: "requested" }),
      expect.objectContaining({ actionType: "recover", status: "applied" })
    ]);
  });

  it("takes over an awaiting approval task and re-enters planning with a note", async () => {
    const store = new MemoryTaskStore();
    const service = createServiceWithGateway({ store });

    const created = await service.createTask({
      id: "task-takeover",
      title: "Take over task",
      prompt: "Re-plan this task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    expect(created.status).toBe("awaiting_approval");

    const takenOver = await service.takeoverTask(
      created.id,
      "Add the operator note and re-run planning."
    );

    expect(takenOver.status).toBe("awaiting_approval");
    expect(
      takenOver.history.some((entry) =>
        entry.note.includes("task.operator_takeover_submitted")
      )
    ).toBe(true);
    expect(takenOver.approvalRequest).toBeDefined();
  });

  it("abandons an in-flight task and clears approval state", async () => {
    const service = createServiceWithGateway();
    const created = await service.createTask({
      id: "task-abandon",
      title: "Abandon task",
      prompt: "Stop this task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    const abandoned = await service.abandonTask(
      created.id,
      "Operator chose to stop this task."
    );

    expect(abandoned.status).toBe("abandoned");
    expect(abandoned.approvalRequest).toBeUndefined();
    expect(abandoned.operatorAllowedActions).toEqual([]);
  });

  it("records rejected operator history when an action is not allowed", async () => {
    const store = new MemoryTaskStore();
    const service = createServiceWithGateway({ store });
    const created = await service.createTask({
      id: "task-reject-operator",
      title: "Reject operator action",
      prompt: "Finish this task",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "low"
    });

    expect(created.status).toBe("completed");

    await expect(
      service.recoverTask(created.id, "Retry a task that has already completed.")
    ).rejects.toThrow();
    await expect(store.listOperatorActions(created.id)).resolves.toEqual([
      expect.objectContaining({ actionType: "recover", status: "requested" }),
      expect.objectContaining({ actionType: "recover", status: "rejected" })
    ]);
  });

  it("recomputes operator actions before validating recovery-required tasks", async () => {
    const store = new StaleRecoveryTaskStore();
    const service = createServiceWithGateway({ store });

    const recovered = await service.recoverTask(
      "task-stale-recovery",
      "Resume execution after rebuild."
    );

    expect(recovered.status).toBe("completed");
    await expect(store.listOperatorActions("task-stale-recovery")).resolves.toEqual([
      expect.objectContaining({ actionType: "recover", status: "requested" }),
      expect.objectContaining({ actionType: "recover", status: "applied" })
    ]);
  });

  it("does not record applied operator history when persisting the recovery transition fails", async () => {
    const store = new FailingRecoverPersistStore();
    const failingClient: ACPClient = {
      ...createMockACPClient(),
      async runAgent(input) {
        if (input.agent === "gongbu-executor") {
          throw new Error("executor unavailable");
        }

        return createMockACPClient().runAgent(input);
      }
    };
    const failingService = createServiceWithGateway({
      realClient: failingClient,
      store
    });
    const service = createServiceWithGateway({ store });

    const failed = await failingService.createTask({
      id: "task-persist-ordering",
      title: "Persist ordering task",
      prompt: "Fail then recover",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "low"
    });

    expect(failed.status).toBe("failed");

    await expect(
      service.recoverTask(failed.id, "Retry after fixing the persistence layer.")
    ).rejects.toThrow("simulated save failure");
    await expect(store.listOperatorActions(failed.id)).resolves.toEqual([
      expect.objectContaining({ actionType: "recover", status: "requested" })
    ]);
  });

  it("summarizes only tasks that need operator attention", async () => {
    const store = new MemoryTaskStore();
    const failingClient: ACPClient = {
      ...createMockACPClient(),
      async runAgent(input) {
        if (input.agent === "gongbu-executor") {
          throw new Error("executor unavailable");
        }

        return createMockACPClient().runAgent(input);
      }
    };
    const failingService = createServiceWithGateway({
      realClient: failingClient,
      store
    });
    const service = createServiceWithGateway({ store });

    const failed = await failingService.createTask({
      id: "task-summary-failed",
      title: "Summary failed task",
      prompt: "Create a failed task",
      allowMock: false,
      requiresApproval: false,
      sensitivity: "low"
    });
    const awaitingApproval = await service.createTask({
      id: "task-summary-awaiting-approval",
      title: "Summary approval task",
      prompt: "Create an approval task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    expect(failed.status).toBe("failed");
    expect(awaitingApproval.status).toBe("awaiting_approval");

    const summary = await service.getOperatorActionSummary();

    expect(summary.tasksNeedingOperatorAttention).toBe(1);
    expect(summary.tasks.map((task) => task.id)).toEqual([failed.id]);
  });
});
