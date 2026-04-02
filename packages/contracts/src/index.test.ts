import { describe, expect, it } from "vitest";
import { TaskRecordSchema, TaskSpecSchema, TaskStatusSchema } from "./index";

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

  it("accepts ACP run summaries and approval request metadata on a task record", () => {
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
  });
});
