import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  RecoveryStateSchema,
  TaskRecordSchema,
  TaskSpecSchema,
  TaskStatusSchema
} from "./index";

describe("contracts", () => {
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

  it("accepts governance and revision metadata on a task record", () => {
    const result = TaskRecordSchema.parse({
      id: "task-1",
      title: "Build overview page",
      prompt: "Create the dashboard",
      status: "needs_revision",
      artifacts: [],
      history: [],
      runIds: ["run-1"],
      approvalRunId: undefined,
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
});
