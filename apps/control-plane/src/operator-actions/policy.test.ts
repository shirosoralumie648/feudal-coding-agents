import { describe, expect, it } from "vitest";
import type { TaskRecord } from "@feudal/contracts";
import { allowedOperatorActionsForTask, syncOperatorActions } from "./policy";

describe("allowedOperatorActionsForTask", () => {
  it("allows recover, takeover, and abandon for recovery-required tasks", () => {
    expect(
      allowedOperatorActionsForTask({
        status: "executing",
        recoveryState: "recovery_required"
      })
    ).toEqual(["recover", "takeover", "abandon"]);
  });

  it("keeps awaiting approval separate from the governance inbox", () => {
    expect(
      allowedOperatorActionsForTask({
        status: "awaiting_approval",
        recoveryState: "healthy"
      })
    ).toEqual(["takeover", "abandon"]);
  });

  it("returns no operator actions for completed work", () => {
    expect(
      allowedOperatorActionsForTask({
        status: "completed",
        recoveryState: "healthy"
      })
    ).toEqual([]);
  });
});

describe("syncOperatorActions", () => {
  it("writes operatorAllowedActions onto the task snapshot", () => {
    const task = syncOperatorActions(
      {
        id: "task-operator",
        title: "Recover executor",
        prompt: "Retry the deployment",
        status: "failed",
        artifacts: [],
        history: [],
        runIds: [],
        runs: [],
        operatorAllowedActions: [],
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:05:00.000Z"
      } satisfies TaskRecord,
      "healthy"
    );

    expect(task.operatorAllowedActions).toEqual([
      "recover",
      "takeover",
      "abandon"
    ]);
  });
});
