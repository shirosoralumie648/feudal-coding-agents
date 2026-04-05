import { describe, expect, it } from "vitest";
import {
  TaskStatusSchema,
  type TaskRecord,
  type TaskSpec
} from "@feudal/contracts";
import {
  aggregateReviewVerdict,
  allowedActionsForStatus,
  createTaskGovernance,
  syncGovernance,
  type ReviewArtifactVerdict
} from "./policy";

const baseSpec: TaskSpec = {
  id: "task-1",
  title: "Draft governance behavior",
  prompt: "Implement policy module",
  allowMock: false,
  requiresApproval: true,
  sensitivity: "medium"
};

const statusesWithoutExplicitActions = TaskStatusSchema.options.filter(
  (status) => status !== "awaiting_approval" && status !== "needs_revision"
);

function createTask(status: TaskRecord["status"]): TaskRecord {
  return {
    id: "task-1",
    title: "Task",
    prompt: "Prompt",
    status,
    artifacts: [],
    history: [],
    runIds: [],
    runs: [],
    governance: createTaskGovernance(baseSpec),
    createdAt: "2026-04-04T00:00:00.000Z",
    updatedAt: "2026-04-04T00:00:00.000Z"
  };
}

describe("createTaskGovernance", () => {
  it("forces approval for high sensitivity and records policy reason", () => {
    const governance = createTaskGovernance({
      ...baseSpec,
      requiresApproval: false,
      sensitivity: "high"
    });

    expect(governance.effectiveRequiresApproval).toBe(true);
    expect(governance.policyReasons).toContain("high sensitivity forced approval");
  });

  it("sets real_with_mock_fallback execution mode when allowMock is true", () => {
    const governance = createTaskGovernance({
      ...baseSpec,
      allowMock: true
    });

    expect(governance.executionMode).toBe("real_with_mock_fallback");
  });

  it("starts with contract-aligned pending review verdict", () => {
    const governance = createTaskGovernance(baseSpec);

    expect(governance.reviewVerdict).toBe("pending");
  });
});

describe("aggregateReviewVerdict", () => {
  it("applies precedence reject > needs_revision > approve", () => {
    const result = aggregateReviewVerdict([
      { reviewer: "approver", verdict: "approve" },
      { reviewer: "reviser", verdict: "needs_revision" },
      { reviewer: "rejector", verdict: "reject" }
    ]);

    expect(result.reviewVerdict).toBe("rejected");
  });

  it("maps approve artifact verdict to approved governance verdict", () => {
    const result = aggregateReviewVerdict([
      { reviewer: "approver", verdict: "approve" }
    ]);

    expect(result.reviewVerdict).toBe("approved");
  });

  it("maps reject artifact verdict to rejected governance verdict", () => {
    const result = aggregateReviewVerdict([
      { reviewer: "rejector", verdict: "reject" }
    ]);

    expect(result.reviewVerdict).toBe("rejected");
  });

  it("maps needs_revision artifact verdict to needs_revision governance verdict", () => {
    const result = aggregateReviewVerdict([
      { reviewer: "reviser", verdict: "needs_revision" }
    ]);

    expect(result.reviewVerdict).toBe("needs_revision");
  });

  it("treats invalid or missing verdict as needs_revision and emits revision request", () => {
    const result = aggregateReviewVerdict([
      { reviewer: "critic-a", verdict: "invalid" },
      { reviewer: "critic-b" }
    ]);

    expect(result.reviewVerdict).toBe("needs_revision");
    expect(result.revisionRequest).toBeDefined();
    expect(result.revisionRequest?.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
    expect(result.policyReasons.length).toBeGreaterThan(0);
  });

  it("ignores non-string dirty reason values without throwing", () => {
    const result = aggregateReviewVerdict([
      {
        reviewer: "reviser",
        verdict: "needs_revision",
        reasons: [null, 42, " valid "] as unknown as string[]
      }
    ]);

    expect(result.reviewVerdict).toBe("needs_revision");
    expect(result.revisionRequest?.reviewerReasons).toEqual(["valid"]);
    expect(result.policyReasons).toEqual(["valid"]);
  });

  it("treats empty review results as needs_revision with explicit system-facing reason", () => {
    const result = aggregateReviewVerdict([]);

    expect(result.reviewVerdict).toBe("needs_revision");
    expect(result.policyReasons).toEqual([
      "no review results available; treated as needs_revision"
    ]);
    expect(result.revisionRequest?.note).toBe(
      "no review results available; treated as needs_revision"
    );
    expect(result.revisionRequest?.reviewerReasons).toEqual([
      "no review results available; treated as needs_revision"
    ]);
  });

  it("treats non-object dirty review entries as revision-class reviews without throwing", () => {
    const result = aggregateReviewVerdict([
      null,
      undefined,
      42
    ] as unknown as ReviewArtifactVerdict[]);

    expect(result.reviewVerdict).toBe("needs_revision");
    expect(result.policyReasons).toEqual([
      "unknown reviewer: invalid or missing review verdict treated as needs_revision",
      "unknown reviewer: invalid or missing review verdict treated as needs_revision",
      "unknown reviewer: invalid or missing review verdict treated as needs_revision"
    ]);
    expect(result.revisionRequest?.reviewerReasons).toEqual([
      "unknown reviewer: invalid or missing review verdict treated as needs_revision",
      "unknown reviewer: invalid or missing review verdict treated as needs_revision",
      "unknown reviewer: invalid or missing review verdict treated as needs_revision"
    ]);
  });

  it("prefers a real needs_revision note over earlier invalid review notes", () => {
    const result = aggregateReviewVerdict([
      {
        reviewer: "validator",
        verdict: "invalid",
        note: "Malformed verdict payload",
        reasons: ["schema mismatch"]
      },
      {
        reviewer: "reviser",
        verdict: "needs_revision",
        note: "Need stronger rollback plan",
        reasons: ["rollback plan missing"]
      }
    ]);

    expect(result.reviewVerdict).toBe("needs_revision");
    expect(result.revisionRequest?.note).toBe("Need stronger rollback plan");
  });

  it("keeps only revision-causing rationale in revision requests", () => {
    const result = aggregateReviewVerdict([
      {
        reviewer: "approver",
        verdict: "approve",
        note: "Looks good to me",
        reasons: ["approve reason should not leak"]
      },
      {
        reviewer: "reviser",
        verdict: "needs_revision",
        note: "Need stronger rollback plan",
        reasons: ["rollback plan missing"]
      },
      {
        reviewer: "validator",
        verdict: "invalid",
        note: "Verdict field malformed",
        reasons: ["schema mismatch"]
      }
    ]);

    expect(result.reviewVerdict).toBe("needs_revision");
    expect(result.revisionRequest?.note).toBe("Need stronger rollback plan");
    expect(result.revisionRequest?.reviewerReasons).toEqual([
      "rollback plan missing",
      "validator: invalid or missing review verdict treated as needs_revision",
      "schema mismatch"
    ]);
    expect(result.policyReasons).toEqual([
      "rollback plan missing",
      "validator: invalid or missing review verdict treated as needs_revision",
      "schema mismatch"
    ]);
  });

  it("keeps reject rationale in policy reasons and excludes non-reject reviews", () => {
    const result = aggregateReviewVerdict([
      {
        reviewer: "approver",
        verdict: "approve",
        note: "safe to ship",
        reasons: ["approve reason should not appear"]
      },
      {
        reviewer: "rejector",
        verdict: "reject",
        note: "Policy violation detected",
        reasons: ["missing approval evidence"]
      },
      {
        reviewer: "reviser",
        verdict: "needs_revision",
        note: "would revise otherwise",
        reasons: ["revision reason should not appear"]
      }
    ]);

    expect(result.reviewVerdict).toBe("rejected");
    expect(result.policyReasons).toEqual([
      "Policy violation detected",
      "missing approval evidence"
    ]);
  });

  it("adds default reject rationale when a rejecting review has no note or reasons", () => {
    const result = aggregateReviewVerdict([
      {
        reviewer: "rejector",
        verdict: "reject"
      }
    ]);

    expect(result.reviewVerdict).toBe("rejected");
    expect(result.policyReasons).toEqual([
      "rejector: review rejected without additional rationale"
    ]);
  });
});

describe("allowedActionsForStatus", () => {
  it("returns approve/reject for awaiting_approval", () => {
    expect(allowedActionsForStatus("awaiting_approval")).toEqual([
      "approve",
      "reject"
    ]);
  });

  it("returns revise for needs_revision", () => {
    expect(allowedActionsForStatus("needs_revision")).toEqual(["revise"]);
  });

  it.each(statusesWithoutExplicitActions)(
    "returns empty actions for %s",
    (status) => {
      expect(allowedActionsForStatus(status)).toEqual([]);
    }
  );
});

describe("syncGovernance", () => {
  it("syncs governance allowedActions from task status", () => {
    const task = createTask("awaiting_approval");

    const updated = syncGovernance(task);

    expect(updated.governance?.allowedActions).toEqual(["approve", "reject"]);
  });
});
