import type { ACPMessage, ACPRun } from "@feudal/acp";
import type { ACPRunSummary, TaskAction, TaskRecord } from "@feudal/contracts";
import { allowedActionsForStatus, syncGovernance } from "../governance/policy";
import { syncOperatorActions } from "../operator-actions/policy";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import type { TaskStore } from "../store";
import {
  applyExecutionMode,
  currentExecutionMode,
  currentRecoveryState
} from "./task-metadata";
import type { TaskRunGateway } from "./task-run-gateway";

export class ActionNotAllowedError extends Error {
  constructor(taskId: string, action: TaskAction) {
    super(`Task ${taskId} does not allow ${action}`);
    this.name = "ActionNotAllowedError";
  }
}

export type PersistTask = (
  taskSnapshot: TaskRecord,
  eventType: string
) => Promise<TaskProjectionRecord>;

export interface StepResult {
  task: TaskRecord;
  run: ACPRun;
}

export type RunStep = (
  task: TaskRecord,
  phase: ACPRunSummary["phase"],
  input: {
    agent: string;
    messages: ACPMessage[];
    metadata?: Record<string, unknown>;
  }
) => Promise<StepResult>;

export type AwaitStep = (
  task: TaskRecord,
  input: {
    label: string;
    prompt: string;
    actions: string[];
    metadata?: Record<string, unknown>;
  }
) => Promise<StepResult>;

export function createPersistTask(options: {
  store: TaskStore;
  initialVersion: number;
}) {
  let latestProjectionVersion = options.initialVersion;

  const persistTask: PersistTask = async (taskSnapshot, eventType) => {
    const syncedSnapshot = syncOperatorActions(
      syncGovernance(taskSnapshot),
      currentRecoveryState(taskSnapshot)
    );
    const projection = await options.store.saveTask(
      syncedSnapshot,
      eventType,
      latestProjectionVersion
    );
    latestProjectionVersion = projection.latestProjectionVersion;
    return projection;
  };

  return persistTask;
}

const OPERATOR_NOTE_ERROR = "Operator note must not be empty";

export function normalizeOperatorNote(note: string) {
  const trimmed = note.trim();

  if (trimmed.length === 0) {
    throw new Error(OPERATOR_NOTE_ERROR);
  }

  return trimmed;
}

export function assertActionAllowed(task: TaskRecord, action: TaskAction) {
  const statusActions = allowedActionsForStatus(task.status);

  if (!statusActions.includes(action)) {
    throw new ActionNotAllowedError(task.id, action);
  }

  const governanceActions = task.governance?.allowedActions;

  if (
    governanceActions &&
    governanceActions.length > 0 &&
    !governanceActions.includes(action)
  ) {
    throw new ActionNotAllowedError(task.id, action);
  }
}

export function assertApprovalActionAllowed(task: TaskRecord, action: TaskAction) {
  if (task.status !== "awaiting_approval" || action === "revise") {
    return;
  }

  if (!task.approvalRequest) {
    return;
  }

  const approvalActions = task.approvalRequest.actions;

  if (!approvalActions.includes(action)) {
    throw new ActionNotAllowedError(task.id, action);
  }
}

export function createStepRunners(options: { runGateway: TaskRunGateway }) {
  const runStep: RunStep = async (task, _phase, input) => {
    const result = await options.runGateway.runAgent(
      { executionMode: currentExecutionMode(task) },
      input
    );

    return {
      task: applyExecutionMode(task, result.executionMode),
      run: result.value
    };
  };

  const awaitStep: AwaitStep = async (task, input) => {
    const result = await options.runGateway.awaitExternalInput(
      { executionMode: currentExecutionMode(task) },
      input
    );

    return {
      task: applyExecutionMode(task, result.executionMode),
      run: result.value
    };
  };

  return { runStep, awaitStep };
}
