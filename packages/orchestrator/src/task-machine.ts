import type { TaskRecord, TaskStatus } from "@feudal/contracts";

export type TaskEvent =
  | { type: "task.submitted" }
  | { type: "intake.completed" }
  | { type: "planning.completed" }
  | { type: "review.approved" }
  | { type: "review.approved_without_approval" }
  | { type: "review.rejected" }
  | { type: "review.revision_requested" }
  | { type: "revision.submitted" }
  | { type: "approval.granted" }
  | { type: "approval.rejected" }
  | { type: "dispatch.completed" }
  | { type: "execution.completed" }
  | { type: "execution.failed" }
  | { type: "verification.passed" }
  | { type: "verification.partial" }
  | { type: "verification.failed" }
  | { type: "operator.recovered" }
  | { type: "operator.takeover_submitted" }
  | { type: "operator.abandoned" };

const transitions: Record<TaskStatus, Partial<Record<TaskEvent["type"], TaskStatus>>> = {
  draft: { "task.submitted": "intake" },
  intake: {
    "intake.completed": "planning",
    "operator.recovered": "dispatching",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  planning: {
    "planning.completed": "review",
    "operator.recovered": "dispatching",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  review: {
    "review.approved": "awaiting_approval",
    "review.approved_without_approval": "dispatching",
    "review.rejected": "rejected",
    "review.revision_requested": "needs_revision",
    "operator.recovered": "dispatching",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  needs_revision: {
    "revision.submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  awaiting_approval: {
    "approval.granted": "dispatching",
    "approval.rejected": "rejected",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  dispatching: {
    "dispatch.completed": "executing",
    "operator.recovered": "dispatching",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  executing: {
    "execution.completed": "verifying",
    "execution.failed": "failed",
    "operator.recovered": "dispatching",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  verifying: {
    "verification.passed": "completed",
    "verification.partial": "partial_success",
    "verification.failed": "failed",
    "operator.recovered": "dispatching",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  completed: {},
  partial_success: {},
  rejected: {},
  failed: {
    "operator.recovered": "dispatching",
    "operator.takeover_submitted": "planning",
    "operator.abandoned": "abandoned"
  },
  rolled_back: {},
  abandoned: {}
};

export function transitionTask(task: TaskRecord, event: TaskEvent): TaskRecord {
  const nextStatus = transitions[task.status]?.[event.type];

  if (!nextStatus) {
    throw new Error(`Illegal transition from ${task.status} via ${event.type}`);
  }

  const now = new Date().toISOString();

  return {
    ...task,
    status: nextStatus,
    updatedAt: now,
    history: [...task.history, { status: nextStatus, at: now, note: event.type }]
  };
}
