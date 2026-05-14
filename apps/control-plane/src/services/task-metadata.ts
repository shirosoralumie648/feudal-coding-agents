import type {
  GovernanceExecutionMode,
  RecoveryState,
  TaskGovernance,
  TaskRecord
} from "@feudal/contracts";
import { createTaskGovernance } from "../governance/policy";

const MOCK_FALLBACK_REASON = "mock fallback used after real ACP failure";
const REVISION_LIMIT_REASON = "revision limit reached";

export function ensureGovernance(task: TaskRecord): TaskGovernance {
  if (task.governance) {
    return task.governance;
  }

  return createTaskGovernance({
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    allowMock: false,
    requiresApproval: task.status === "awaiting_approval",
    sensitivity: "medium"
  });
}

export function currentExecutionMode(task: TaskRecord): GovernanceExecutionMode {
  return ensureGovernance(task).executionMode;
}

export function mergePolicyReasons(existing: string[], additions: string[]): string[] {
  const merged = [...existing];

  for (const reason of additions) {
    if (!merged.includes(reason)) {
      merged.push(reason);
    }
  }

  return merged;
}

export function applyExecutionMode(
  task: TaskRecord,
  executionMode: GovernanceExecutionMode
): TaskRecord {
  const governance = ensureGovernance(task);
  const switchedToFallback =
    governance.executionMode !== "mock_fallback_used" &&
    executionMode === "mock_fallback_used";
  const policyReasons = switchedToFallback
    ? mergePolicyReasons(governance.policyReasons, [MOCK_FALLBACK_REASON])
    : governance.policyReasons;

  return {
    ...task,
    governance: {
      ...governance,
      executionMode,
      policyReasons
    }
  };
}

export function currentRecoveryState(task: TaskRecord): RecoveryState {
  return (task as TaskRecord & { recoveryState?: RecoveryState }).recoveryState ?? "healthy";
}

export function withRecoveryState(task: TaskRecord, recoveryState: RecoveryState): TaskRecord {
  const projectionTask = task as TaskRecord & { recoveryReason?: string };

  return {
    ...task,
    recoveryState,
    recoveryReason:
      recoveryState === "healthy" ? undefined : projectionTask.recoveryReason
  } as TaskRecord;
}

export function replaceLatestHistoryNote(task: TaskRecord, note: string): TaskRecord {
  if (task.history.length === 0) {
    return task;
  }

  const history = [...task.history];
  history[history.length - 1] = {
    ...history[history.length - 1]!,
    note
  };

  return { ...task, history };
}

export function createRevisionLimitRejection(task: TaskRecord): TaskRecord {
  const governance = ensureGovernance(task);

  return {
    ...task,
    governance: {
      ...governance,
      reviewVerdict: "rejected",
      policyReasons: mergePolicyReasons(governance.policyReasons, [REVISION_LIMIT_REASON])
    },
    revisionRequest: {
      note: REVISION_LIMIT_REASON,
      reviewerReasons: [REVISION_LIMIT_REASON],
      createdAt: new Date().toISOString()
    }
  };
}
