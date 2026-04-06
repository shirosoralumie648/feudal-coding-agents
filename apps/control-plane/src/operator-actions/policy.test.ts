import { describe, expect, it } from "vitest";
import { TaskRecordSchema } from "@feudal/contracts";
import {
  operatorAllowedActionsForTask,
  syncOperatorActions
} from "./policy";

const baseTask = TaskRecordSchema.parse({
  id: "task-operator-policy",
  title: "Recover executor",
  prompt: "Retry the deployment",
  status: "planning",
  artifacts: [],
  history: [],
  runIds: [],
  runs: [],
  operatorAllowedActions: [],
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
  createdAt: "2026-04-06T00:00:00.000Z",
  updatedAt: "2026-04-06T00:05:00.000Z"
});

describe("operator action policy", () => {
  it("separates operator actions from governance states", () => {
    expect(
      operatorAllowedActionsForTask({
        status: "failed",
        recoveryState: "healthy"
      })
    ).toEqual(["recover", "takeover", "abandon"]);

    expect(
      operatorAllowedActionsForTask({
        status: "awaiting_approval",
        recoveryState: "healthy"
      })
    ).toEqual(["takeover", "abandon"]);

    expect(
      operatorAllowedActionsForTask({
        status: "completed",
        recoveryState: "healthy"
      })
    ).toEqual([]);
  });

  it("treats interrupted in-flight work as recoverable", () => {
    expect(
      syncOperatorActions(baseTask, "recovery_required").operatorAllowedActions
    ).toEqual(["recover", "takeover", "abandon"]);

    expect(
      operatorAllowedActionsForTask({
        status: "needs_revision",
        recoveryState: "healthy"
      })
    ).toEqual(["abandon"]);
  });
});
