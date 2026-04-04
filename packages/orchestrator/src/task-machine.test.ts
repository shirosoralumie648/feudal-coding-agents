import { describe, expect, it } from "vitest";
import type { TaskRecord } from "@feudal/contracts";
import { transitionTask } from "./task-machine";

const baseTask: TaskRecord = {
  id: "task-1",
  title: "Build overview page",
  prompt: "Create the dashboard",
  status: "draft",
  artifacts: [],
  history: [],
  runIds: [],
  runs: [],
  governance: {
    requestedRequiresApproval: true,
    effectiveRequiresApproval: true,
    allowMock: false,
    sensitivity: "medium",
    executionMode: "real",
    policyReasons: [],
    reviewVerdict: "approve",
    allowedActions: [],
    revisionCount: 0
  },
  createdAt: "2026-04-02T00:00:00.000Z",
  updatedAt: "2026-04-02T00:00:00.000Z"
};

describe("transitionTask", () => {
  it("advances through the happy path", () => {
    const submitted = transitionTask(baseTask, { type: "task.submitted" });
    const planned = transitionTask(submitted, { type: "intake.completed" });

    expect(submitted.status).toBe("intake");
    expect(planned.status).toBe("planning");
  });

  it("routes review outcomes into revision, rejection, and direct dispatch", () => {
    const reviewTask = { ...baseTask, status: "review" as const };
    const reviewTaskWithoutApproval = {
      ...reviewTask,
      governance: {
        ...reviewTask.governance,
        requestedRequiresApproval: false,
        effectiveRequiresApproval: false
      }
    };

    expect(
      transitionTask(reviewTask, { type: "review.revision_requested" }).status
    ).toBe("needs_revision");
    expect(transitionTask(reviewTask, { type: "review.rejected" }).status).toBe(
      "rejected"
    );
    expect(
      transitionTask(reviewTaskWithoutApproval, {
        type: "review.approved_without_approval"
      }).status
    ).toBe("dispatching");
  });

  it("rejects illegal transitions", () => {
    expect(() =>
      transitionTask(baseTask, { type: "approval.granted" })
    ).toThrow("Illegal transition");
  });
});
