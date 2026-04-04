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
  | { type: "verification.failed" };

const transitions: Record<TaskStatus, Partial<Record<TaskEvent["type"], TaskStatus>>> = {
  draft: { "task.submitted": "intake" },
  intake: { "intake.completed": "planning" },
  planning: { "planning.completed": "review" },
  review: {
    "review.approved": "awaiting_approval",
    "review.approved_without_approval": "dispatching",
    "review.rejected": "rejected",
    "review.revision_requested": "needs_revision"
  },
  needs_revision: { "revision.submitted": "planning" },
  awaiting_approval: {
    "approval.granted": "dispatching",
    "approval.rejected": "rejected"
  },
  dispatching: { "dispatch.completed": "executing" },
  executing: {
    "execution.completed": "verifying",
    "execution.failed": "failed"
  },
  verifying: {
    "verification.passed": "completed",
    "verification.partial": "partial_success",
    "verification.failed": "failed"
  },
  completed: {},
  partial_success: {},
  rejected: {},
  failed: {},
  rolled_back: {}
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
