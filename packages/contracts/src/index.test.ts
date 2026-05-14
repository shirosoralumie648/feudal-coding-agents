import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  OperatorActionRecordSchema,
  OperatorActionRequestSchema,
  OperatorActionSummarySchema,
  RecoverySummarySchema,
  RecoveryStateSchema,
  RunProjectionSchema,
  TaskProjectionSchema,
  PluginManifestSchema,
  WorkflowPhaseSchema,
  deriveWorkflowPhase,
  TaskRecordSchema,
  TaskSpecSchema,
  TaskStatusSchema
} from "./index";

describe("contracts", () => {
  it("exports plugin manifest schemas from the root contract module", () => {
    const result = PluginManifestSchema.parse({
      id: "local.agent-plugin",
      name: "Local Agent Plugin",
      version: "1.0.0",
      capabilities: ["agent-registration"],
      extensionPoints: [
        {
          type: "acp-worker",
          id: "local.agent-plugin.worker",
          workerName: "local-worker",
          displayName: "Local Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json"
        }
      ],
      entry: {
        module: "dist/index.js"
      },
      compatibility: {
        app: "feudal-coding-agents"
      }
    });

    expect(result.id).toBe("local.agent-plugin");
  });

  it("accepts a new task spec", () => {
    const result = TaskSpecSchema.parse({
      id: "task-1",
      title: "Build overview page",
      prompt: "Create the dashboard",
      allowMock: true,
      requiresApproval: true,
      sensitivity: "medium"
    });

    expect(result.title).toBe("Build overview page");
  });

  it("contains the ACP approval checkpoint state", () => {
    expect(TaskStatusSchema.options).toContain("awaiting_approval");
  });

  it("contains the operator abandoned state", () => {
    expect(TaskStatusSchema.options).toContain("abandoned");
  });

  it("contains explicit workflow phases for orchestration views", () => {
    expect(WorkflowPhaseSchema.options).toEqual(
      expect.arrayContaining([
        "intake",
        "planning",
        "review",
        "approval",
        "execution",
        "verification",
        "revision",
        "recovery",
        "completed",
        "terminal"
      ])
    );
  });

  it("accepts ACP run summaries and approval request metadata without governance", () => {
    const result = TaskRecordSchema.parse({
      id: "task-1",
      title: "Build overview page",
      prompt: "Create the dashboard",
      status: "review",
      artifacts: [],
      history: [],
      runIds: ["run-1"],
      approvalRunId: "run-1",
      runs: [
        {
          id: "run-1",
          agent: "auditor-agent",
          status: "awaiting",
          phase: "review",
          awaitPrompt: "Approve the plan?",
          allowedActions: ["approve", "reject"]
        }
      ],
      approvalRequest: {
        runId: "run-1",
        prompt: "Approve the plan?",
        actions: ["approve", "reject"]
      },
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    });

    expect(result.runs[0]?.phase).toBe("review");
    expect(result.approvalRequest?.runId).toBe("run-1");
    expect(result.governance).toBeUndefined();
  });

  it("accepts pending review verdict for pre-review governance state", () => {
    const result = TaskRecordSchema.parse({
      id: "task-2",
      title: "Build task detail page",
      prompt: "Create the task detail view",
      status: "planning",
      artifacts: [],
      history: [],
      runIds: [],
      governance: {
        requestedRequiresApproval: true,
        effectiveRequiresApproval: true,
        allowMock: false,
        sensitivity: "medium",
        executionMode: "real",
        policyReasons: [],
        reviewVerdict: "pending",
        allowedActions: [],
        revisionCount: 0
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:05:00.000Z"
    });

    expect(result.governance?.reviewVerdict).toBe("pending");
  });

  it("accepts approved and rejected review verdict names", () => {
    const approved = TaskRecordSchema.parse({
      id: "task-3",
      title: "Build approvals page",
      prompt: "Create the approvals view",
      status: "review",
      artifacts: [],
      history: [],
      runIds: [],
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
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:05:00.000Z"
    });

    const rejected = TaskRecordSchema.parse({
      id: "task-4",
      title: "Build reject path",
      prompt: "Create the rejection path",
      status: "rejected",
      artifacts: [],
      history: [],
      runIds: [],
      governance: {
        requestedRequiresApproval: true,
        effectiveRequiresApproval: true,
        allowMock: false,
        sensitivity: "high",
        executionMode: "real",
        policyReasons: [],
        reviewVerdict: "rejected",
        allowedActions: [],
        revisionCount: 0
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:05:00.000Z"
    });

    expect(approved.governance?.reviewVerdict).toBe("approved");
    expect(rejected.governance?.reviewVerdict).toBe("rejected");
  });

  it("accepts governance and revision metadata on a task record", () => {
    const result = TaskRecordSchema.parse({
      id: "task-1",
      title: "Build overview page",
      prompt: "Create the dashboard",
      status: "needs_revision",
      artifacts: [],
      history: [],
      runIds: ["run-1"],
      runs: [],
      governance: {
        requestedRequiresApproval: false,
        effectiveRequiresApproval: true,
        allowMock: true,
        sensitivity: "high",
        executionMode: "real_with_mock_fallback",
        policyReasons: ["high sensitivity forced approval"],
        reviewVerdict: "needs_revision",
        allowedActions: ["revise"],
        revisionCount: 1
      },
      revisionRequest: {
        note: "Clarify rollback expectations.",
        reviewerReasons: ["critic-agent requested tighter rollback language"],
        createdAt: "2026-04-04T00:00:00.000Z"
      },
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:05:00.000Z"
    });

    expect(result.governance.allowedActions).toEqual(["revise"]);
    expect(result.revisionRequest?.reviewerReasons).toContain(
      "critic-agent requested tighter rollback language"
    );
  });

  it("accepts operator allowed actions on a task record", () => {
    const result = TaskRecordSchema.parse({
      id: "task-5",
      title: "Recover stuck task",
      prompt: "Handle takeover",
      status: "failed",
      workflowPhase: "recovery",
      artifacts: [],
      history: [],
      runIds: [],
      operatorAllowedActions: ["recover", "takeover", "abandon"],
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:05:00.000Z"
    });

    expect(result.operatorAllowedActions).toEqual([
      "recover",
      "takeover",
      "abandon"
    ]);
    expect(result.workflowPhase).toBe("recovery");
  });

  it("derives approval, recovery, and terminal workflow phases from task state", () => {
    expect(
      deriveWorkflowPhase({
        status: "awaiting_approval",
        recoveryState: "healthy"
      })
    ).toBe("approval");

    expect(
      deriveWorkflowPhase({
        status: "failed",
        recoveryState: "healthy"
      })
    ).toBe("recovery");

    expect(
      deriveWorkflowPhase({
        status: "executing",
        recoveryState: "recovery_required"
      })
    ).toBe("recovery");

    expect(
      deriveWorkflowPhase({
        status: "abandoned",
        recoveryState: "healthy"
      })
    ).toBe("terminal");
  });

  it("accepts operator action history records", () => {
    const requestedResult = OperatorActionRecordSchema.parse({
      id: 0,
      taskId: "task-4",
      actionType: "takeover",
      status: "requested",
      note: "Operator is taking over recovery handling",
      actorType: "operator",
      actorId: "operator-2",
      createdAt: "2026-04-04T00:00:00.000Z"
    });
    const appliedResult = OperatorActionRecordSchema.parse({
      id: 1,
      taskId: "task-5",
      actionType: "recover",
      status: "applied",
      note: "Recovered from failed state",
      actorType: "operator",
      actorId: "operator-1",
      createdAt: "2026-04-04T00:00:00.000Z",
      appliedAt: "2026-04-04T00:00:10.000Z"
    });
    const rejectedResult = OperatorActionRecordSchema.parse({
      id: 2,
      taskId: "task-6",
      actionType: "takeover",
      status: "rejected",
      note: "Takeover request rejected by policy",
      actorType: "operator",
      createdAt: "2026-04-04T00:00:00.000Z",
      rejectedAt: "2026-04-04T00:00:10.000Z",
      rejectionReason: "active approval review in progress"
    });

    expect(requestedResult.status).toBe("requested");
    expect(appliedResult.id).toBe(1);
    expect(appliedResult.actionType).toBe("recover");
    expect(appliedResult.appliedAt).toBe("2026-04-04T00:00:10.000Z");
    expect(rejectedResult.status).toBe("rejected");
    expect(rejectedResult.rejectionReason).toBe(
      "active approval review in progress"
    );
  });

  it("accepts operator action request payloads", () => {
    const result = OperatorActionRequestSchema.parse({
      actionType: "abandon",
      note: "Abort task due to invalid external dependency state",
      confirm: true
    });

    expect(result.actionType).toBe("abandon");
    expect(result.confirm).toBe(true);
  });

  it("rejects operator action request payloads with whitespace-only notes", () => {
    const result = OperatorActionRequestSchema.safeParse({
      actionType: "recover",
      note: "   "
    });

    expect(result.success).toBe(false);
  });

  it("rejects operator action history records with whitespace-only notes", () => {
    const result = OperatorActionRecordSchema.safeParse({
      id: 3,
      taskId: "task-7",
      actionType: "recover",
      status: "requested",
      note: "   ",
      actorType: "operator",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    expect(result.success).toBe(false);
  });

  it("rejects applied operator action records without appliedAt", () => {
    const result = OperatorActionRecordSchema.safeParse({
      id: 4,
      taskId: "task-8",
      actionType: "recover",
      status: "applied",
      note: "Recovered execution after restart",
      actorType: "operator",
      createdAt: "2026-04-04T00:00:00.000Z"
    });

    expect(result.success).toBe(false);
  });

  it("rejects rejected operator action records without rejectedAt", () => {
    const result = OperatorActionRecordSchema.safeParse({
      id: 5,
      taskId: "task-9",
      actionType: "abandon",
      status: "rejected",
      note: "Abandon request blocked",
      actorType: "operator",
      createdAt: "2026-04-04T00:00:00.000Z",
      rejectionReason: "task already completed"
    });

    expect(result.success).toBe(false);
  });

  it("rejects rejected operator action records without rejectionReason", () => {
    const result = OperatorActionRecordSchema.safeParse({
      id: 6,
      taskId: "task-10",
      actionType: "abandon",
      status: "rejected",
      note: "Abandon request blocked",
      actorType: "operator",
      createdAt: "2026-04-04T00:00:00.000Z",
      rejectedAt: "2026-04-04T00:00:10.000Z"
    });

    expect(result.success).toBe(false);
  });

  it("accepts operator action summary payloads", () => {
    const result = OperatorActionSummarySchema.parse({
      tasksNeedingOperatorAttention: 1,
      tasks: [
        {
          id: "task-5",
          title: "Recover stuck task",
          status: "executing",
          recoveryState: "recovery_required",
          recoveryReason: "run heartbeat timeout",
          operatorAllowedActions: ["recover", "takeover", "abandon"]
        }
      ]
    });

    expect(result.tasksNeedingOperatorAttention).toBe(1);
    expect(result.tasks[0]?.recoveryState).toBe("recovery_required");
  });

  it("accepts audit event and recovery state metadata", () => {
    const recoveryState = RecoveryStateSchema.parse("healthy");
    const event = AuditEventSchema.parse({
      id: 1,
      streamType: "task",
      streamId: "task-1",
      eventType: "task.created",
      eventVersion: 1,
      occurredAt: "2026-04-03T00:00:00.000Z",
      payloadJson: { status: "draft" },
      metadataJson: { actorType: "control-plane" }
    });

    expect(recoveryState).toBe("healthy");
    expect(event.eventType).toBe("task.created");
  });

  it("accepts task projections, run projections, and recovery summaries as first-class api contracts", () => {
    const taskProjection = TaskProjectionSchema.parse({
      id: "task-11",
      title: "Recover task projection contract",
      prompt: "Exercise projected task fields",
      status: "failed",
      workflowPhase: "recovery",
      artifacts: [],
      history: [],
      runIds: ["run-11"],
      runs: [
        {
          id: "run-11",
          agent: "gongbu-executor",
          status: "failed",
          phase: "execution"
        }
      ],
      operatorAllowedActions: ["recover", "takeover", "abandon"],
      createdAt: "2026-04-09T00:00:00.000Z",
      updatedAt: "2026-04-09T00:05:00.000Z",
      recoveryState: "recovery_required",
      recoveryReason: "Recovered executing task requires operator review",
      lastRecoveredAt: "2026-04-09T00:05:00.000Z",
      latestEventId: 12,
      latestProjectionVersion: 8
    });
    const runProjection = RunProjectionSchema.parse({
      id: "run-11",
      taskId: "task-11",
      agent: "gongbu-executor",
      status: "failed",
      phase: "execution",
      messages: [],
      artifacts: [],
      recoveryState: "healthy",
      lastRecoveredAt: "2026-04-09T00:05:00.000Z",
      latestEventId: 21,
      latestProjectionVersion: 4
    });
    const recoverySummary = RecoverySummarySchema.parse({
      tasksNeedingRecovery: 1,
      runsNeedingRecovery: 2,
      taskBreakdown: {
        healthy: 3,
        replaying: 0,
        recoveryRequired: 1
      },
      runRecoveryBreakdown: {
        healthy: 5,
        replaying: 0,
        recoveryRequired: 2
      },
      runStatusBreakdown: {
        created: 1,
        inProgress: 1,
        awaiting: 1,
        completed: 1,
        failed: 1,
        cancelling: 0,
        cancelled: 0
      }
    });

    expect(taskProjection.recoveryState).toBe("recovery_required");
    expect(runProjection.latestProjectionVersion).toBe(4);
    expect(recoverySummary.runsNeedingRecovery).toBe(2);
    expect(recoverySummary.runStatusBreakdown.inProgress).toBe(1);
  });
});
