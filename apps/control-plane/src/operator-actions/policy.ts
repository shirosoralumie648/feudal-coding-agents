import type {
  OperatorActionType,
  RecoveryState,
  TaskRecord,
  TaskStatus
} from "@feudal/contracts";

const TERMINAL_OR_CLOSED_STATUSES: TaskStatus[] = [
  "completed",
  "partial_success",
  "rejected",
  "rolled_back",
  "abandoned"
];

export function operatorAllowedActionsForTask(input: {
  status: TaskStatus;
  recoveryState: RecoveryState;
}): OperatorActionType[] {
  const actions: OperatorActionType[] = [];

  if (
    input.status === "failed" ||
    input.recoveryState === "recovery_required"
  ) {
    actions.push("recover");
  }

  if (
    input.status === "failed" ||
    input.status === "awaiting_approval" ||
    input.recoveryState === "recovery_required"
  ) {
    actions.push("takeover");
  }

  if (!TERMINAL_OR_CLOSED_STATUSES.includes(input.status)) {
    actions.push("abandon");
  }

  return actions;
}

export function syncOperatorActions(
  task: TaskRecord,
  recoveryState: RecoveryState = "healthy"
): TaskRecord {
  return {
    ...task,
    operatorAllowedActions: operatorAllowedActionsForTask({
      status: task.status,
      recoveryState
    })
  };
}
