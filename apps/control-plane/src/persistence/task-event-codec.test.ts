import { describe, expect, it } from "vitest";
import { TaskRecordSchema, type ACPRunSummary } from "@feudal/contracts";
import { buildTaskEventInputs } from "./task-event-codec";

function buildRunSummary(input: Partial<ACPRunSummary> = {}): ACPRunSummary {
  return {
    id: input.id ?? "run-approval",
    agent: input.agent ?? "approval-gate",
    status: input.status ?? "awaiting",
    phase: input.phase ?? "approval",
    awaitPrompt: input.awaitPrompt ?? "Approve the decision brief?",
    allowedActions: input.allowedActions ?? ["approve", "reject"]
  };
}

function buildTaskRecord(
  overrides: Partial<ReturnType<typeof TaskRecordSchema.parse>> = {}
) {
  return TaskRecordSchema.parse({
    id: "task-1",
    title: "Build dashboard",
    prompt: "Create the dashboard task",
    status: "awaiting_approval",
    artifacts: [],
    history: [],
    runIds: ["run-approval"],
    approvalRunId: "run-approval",
    runs: [buildRunSummary()],
    approvalRequest: {
      runId: "run-approval",
      prompt: "Approve the decision brief?",
      actions: ["approve", "reject"]
    },
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides
  });
}

describe("task event codec", () => {
  it("creates self-consistent diff metadata for new tasks", () => {
    const task = {
      ...buildTaskRecord(),
      recoveryState: "healthy" as const,
      latestEventId: 7,
      latestProjectionVersion: 8
    };

    const [businessEvent, diffEvent] = buildTaskEventInputs(
      task,
      "task.created"
    );

    expect(businessEvent.payloadJson).not.toHaveProperty("recoveryState");
    expect(businessEvent.payloadJson).not.toHaveProperty("latestEventId");
    expect(businessEvent.payloadJson).not.toHaveProperty("latestProjectionVersion");
    expect(diffEvent.payloadJson).toEqual({
      targetType: "task",
      targetId: "task-1",
      beforeSubsetJson: {},
      afterSubsetJson: {
        status: "awaiting_approval",
        approvalRequest: {
          runId: "run-approval",
          prompt: "Approve the decision brief?",
          actions: ["approve", "reject"]
        },
        runs: [buildRunSummary()]
      },
      patchJson: [
        { op: "add", path: "/status", value: "awaiting_approval" },
        {
          op: "add",
          path: "/approvalRequest",
          value: {
            runId: "run-approval",
            prompt: "Approve the decision brief?",
            actions: ["approve", "reject"]
          }
        },
        { op: "add", path: "/runs", value: [buildRunSummary()] }
      ],
      changedPaths: ["/status", "/approvalRequest", "/runs"]
    });
  });

  it("tracks replacements and removals from the previous task snapshot", () => {
    const previousTask = buildTaskRecord();
    const nextTask = buildTaskRecord({
      status: "completed",
      approvalRunId: undefined,
      approvalRequest: undefined,
      runs: [
        buildRunSummary(),
        {
          id: "run-execution",
          agent: "gongbu-executor",
          status: "completed",
          phase: "execution"
        }
      ],
      updatedAt: "2026-04-03T00:05:00.000Z"
    });

    const [, diffEvent] = buildTaskEventInputs(
      nextTask,
      "task.approved",
      previousTask
    );

    expect(diffEvent.payloadJson).toEqual({
      targetType: "task",
      targetId: "task-1",
      beforeSubsetJson: {
        status: "awaiting_approval",
        approvalRequest: {
          runId: "run-approval",
          prompt: "Approve the decision brief?",
          actions: ["approve", "reject"]
        },
        runs: [buildRunSummary()]
      },
      afterSubsetJson: {
        status: "completed",
        runs: [
          buildRunSummary(),
          {
            id: "run-execution",
            agent: "gongbu-executor",
            status: "completed",
            phase: "execution"
          }
        ]
      },
      patchJson: [
        { op: "replace", path: "/status", value: "completed" },
        { op: "remove", path: "/approvalRequest" },
        {
          op: "replace",
          path: "/runs",
          value: [
            buildRunSummary(),
            {
              id: "run-execution",
              agent: "gongbu-executor",
              status: "completed",
              phase: "execution"
            }
          ]
        }
      ],
      changedPaths: ["/status", "/approvalRequest", "/runs"]
    });
  });

  it("tracks governance and revision diffs alongside approval metadata", () => {
    const task = buildTaskRecord({
      status: "needs_revision",
      governance: {
        requestedRequiresApproval: false,
        effectiveRequiresApproval: true,
        allowMock: true,
        sensitivity: "high",
        executionMode: "mock_fallback_used",
        policyReasons: ["high sensitivity forced approval"],
        reviewVerdict: "needs_revision",
        allowedActions: ["revise"],
        revisionCount: 1
      },
      revisionRequest: {
        note: "Clarify rollback expectations.",
        reviewerReasons: ["critic-agent requested tighter rollback language"],
        createdAt: "2026-04-04T00:00:00.000Z"
      }
    });

    const [, diffEvent] = buildTaskEventInputs(
      task,
      "task.review_revision_requested"
    );

    expect(diffEvent.payloadJson).toMatchObject({
      changedPaths: expect.arrayContaining([
        "/status",
        "/governance",
        "/revisionRequest"
      ])
    });
  });
});
