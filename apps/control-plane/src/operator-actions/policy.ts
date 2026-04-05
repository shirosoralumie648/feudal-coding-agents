import type {
  OperatorActionType,
  RecoveryState,
  TaskRecord,
  TaskStatus
} from "@feudal/contracts";

const TERMINAL_STATUSES = new Set<TaskStatus>([
  "completed",
  "partial_success",
  "rejected",
  "rolled_back",
  "abandoned"
]);

export class OperatorActionNotAllowedError extends Error {
  constructor(taskId: string, action: OperatorActionType) {
    super(`Task ${taskId} does not allow operator action ${action}`);
    this.name = "OperatorActionNotAllowedError";
  }
}

export function allowedOperatorActionsForTask(input: {
  status: TaskStatus;
  recoveryState: RecoveryState;
}): OperatorActionType[] {
  const actions: OperatorActionType[] = [];

  if (input.status === "failed" || input.recoveryState === "recovery_required") {
    actions.push("recover");
  }

  if (
    input.status === "failed" ||
    input.status === "awaiting_approval" ||
    input.recoveryState === "recovery_required"
  ) {
    actions.push("takeover");
  }

  if (!TERMINAL_STATUSES.has(input.status)) {
    actions.push("abandon");
  }

  return actions;
}

export function syncOperatorActions<T extends TaskRecord>(
  task: T,
  recoveryState: RecoveryState
): T {
  return {
    ...task,
    operatorAllowedActions: allowedOperatorActionsForTask({
      status: task.status,
      recoveryState
    })
  };
}

export function assertOperatorActionAllowed(
  task: Pick<TaskRecord, "id" | "operatorAllowedActions">,
  action: OperatorActionType
) {
  if (!task.operatorAllowedActions.includes(action)) {
    throw new OperatorActionNotAllowedError(task.id, action);
  }
}
