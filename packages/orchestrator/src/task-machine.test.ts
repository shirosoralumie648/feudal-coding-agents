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
    reviewVerdict: "pending",
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

    expect(
      transitionTask(reviewTask, { type: "review.revision_requested" }).status
    ).toBe("needs_revision");
    expect(transitionTask(reviewTask, { type: "review.rejected" }).status).toBe(
      "rejected"
    );
    expect(
      transitionTask(reviewTask, { type: "review.approved_without_approval" }).status
    ).toBe("dispatching");
  });

  it("routes review approval into awaiting approval", () => {
    const reviewTask = { ...baseTask, status: "review" as const };

    expect(transitionTask(reviewTask, { type: "review.approved" }).status).toBe(
      "awaiting_approval"
    );
  });

  it("rejects illegal transitions", () => {
    expect(() =>
      transitionTask(baseTask, { type: "approval.granted" })
    ).toThrow("Illegal transition");
  });

  it("routes failed task recovery back to dispatching", () => {
    const failedTask = { ...baseTask, status: "failed" as const };

    expect(transitionTask(failedTask, { type: "operator.recovered" }).status).toBe(
      "dispatching"
    );
  });

  it("routes takeover submissions from awaiting approval to planning", () => {
    const awaitingTask = { ...baseTask, status: "awaiting_approval" as const };

    expect(
      transitionTask(awaitingTask, { type: "operator.takeover_submitted" }).status
    ).toBe("planning");
  });

  it("routes takeover submissions from executing to planning", () => {
    const executingTask = { ...baseTask, status: "executing" as const };

    expect(
      transitionTask(executingTask, { type: "operator.takeover_submitted" }).status
    ).toBe("planning");
  });

  it("routes abandon requests from needs revision to abandoned", () => {
    const needsRevisionTask = { ...baseTask, status: "needs_revision" as const };

    expect(
      transitionTask(needsRevisionTask, { type: "operator.abandoned" }).status
    ).toBe("abandoned");
  });
});
