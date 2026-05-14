import { transitionTask } from "@feudal/orchestrator";
import {
  assertOperatorActionAllowed,
  syncOperatorActions
} from "../operator-actions/policy";
import type { TaskStore } from "../store";
import {
  replaceLatestHistoryNote,
  withRecoveryState
} from "./task-metadata";
import {
  runExecutionAndVerification,
  runPlanningReviewAndBranch
} from "./orchestrator-flows";
import type { OperatorCoordinator } from "./orchestrator-types";
import {
  createPersistTask,
  normalizeOperatorNote,
  type AwaitStep,
  type RunStep
} from "./orchestrator-runtime";

export function createOperatorCoordinator(options: {
  store: TaskStore;
  listAgents?: () => Promise<Array<{ name: string; enabledByDefault?: boolean }>>;
  runStep: RunStep;
  awaitStep: AwaitStep;
}): OperatorCoordinator {
  async function recordRequestedThenValidate(
    current: Awaited<ReturnType<TaskStore["getTask"]>> extends infer T ? NonNullable<T> : never,
    actionType: "recover" | "takeover" | "abandon",
    note: string
  ) {
    // Requested/audited first, then validated, so rejected operator attempts remain visible.
    await options.store.recordOperatorAction({
      taskId: current.id,
      actionType,
      status: "requested",
      note,
      payloadJson: {
        fromStatus: current.status,
        recoveryState: current.recoveryState
      }
    });

    try {
      assertOperatorActionAllowed(
        syncOperatorActions(current, current.recoveryState),
        actionType
      );
    } catch (error) {
      await options.store.recordOperatorAction({
        taskId: current.id,
        actionType,
        status: "rejected",
        note,
        rejectedAt: new Date().toISOString(),
        rejectionReason: error instanceof Error ? error.message : "Operator action rejected"
      });
      throw error;
    }
  }

  return {
    async recover(taskId, noteInput) {
      const current = await options.store.getTask(taskId);

      if (!current) {
        throw new Error(`Task ${taskId} not found`);
      }

      const note = normalizeOperatorNote(noteInput);
      await recordRequestedThenValidate(current, "recover", note);

      const persistTask = createPersistTask({
        store: options.store,
        initialVersion: current.latestProjectionVersion
      });
      let task = transitionTask(withRecoveryState(current, "healthy"), {
        type: "operator.recovered"
      });
      task = replaceLatestHistoryNote(task, `task.operator_recovered: ${note}`);
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined
      };

      const persisted = await persistTask(task, "task.operator_recovered");
      await options.store.recordOperatorAction({
        taskId,
        actionType: "recover",
        status: "applied",
        note,
        appliedAt: new Date().toISOString(),
        payloadJson: { eventType: "task.operator_recovered" }
      });

      return runExecutionAndVerification({
        task: persisted,
        persistTask,
        runMetadata: { taskId },
        runStep: options.runStep
      });
    },

    async takeover(taskId, noteInput) {
      const current = await options.store.getTask(taskId);

      if (!current) {
        throw new Error(`Task ${taskId} not found`);
      }

      const note = normalizeOperatorNote(noteInput);
      await recordRequestedThenValidate(current, "takeover", note);

      const persistTask = createPersistTask({
        store: options.store,
        initialVersion: current.latestProjectionVersion
      });
      let task = transitionTask(withRecoveryState(current, "healthy"), {
        type: "operator.takeover_submitted"
      });
      task = replaceLatestHistoryNote(task, `task.operator_takeover_submitted: ${note}`);
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined,
        governance: task.governance
          ? { ...task.governance, reviewVerdict: "pending" }
          : task.governance,
        revisionRequest: undefined
      };

      const persisted = await persistTask(task, "task.operator_takeover_submitted");
      await options.store.recordOperatorAction({
        taskId,
        actionType: "takeover",
        status: "applied",
        note,
        appliedAt: new Date().toISOString(),
        payloadJson: { eventType: "task.operator_takeover_submitted" }
      });

      return runPlanningReviewAndBranch({
        task: persisted,
        persistTask,
        runMetadata: { taskId },
        revisionNote: note,
        listAgents: options.listAgents,
        runStep: options.runStep,
        awaitStep: options.awaitStep
      });
    },

    async abandon(taskId, noteInput) {
      const current = await options.store.getTask(taskId);

      if (!current) {
        throw new Error(`Task ${taskId} not found`);
      }

      const note = normalizeOperatorNote(noteInput);
      await recordRequestedThenValidate(current, "abandon", note);

      const persistTask = createPersistTask({
        store: options.store,
        initialVersion: current.latestProjectionVersion
      });
      let task = transitionTask(withRecoveryState(current, "healthy"), {
        type: "operator.abandoned"
      });
      task = replaceLatestHistoryNote(task, `task.operator_abandoned: ${note}`);
      task = {
        ...task,
        approvalRunId: undefined,
        approvalRequest: undefined,
        revisionRequest: undefined
      };

      const persisted = await persistTask(task, "task.operator_abandoned");
      await options.store.recordOperatorAction({
        taskId,
        actionType: "abandon",
        status: "applied",
        note,
        appliedAt: new Date().toISOString(),
        payloadJson: { eventType: "task.operator_abandoned" }
      });

      return persisted;
    },

    async listActions(taskId) {
      return options.store.listOperatorActions(taskId);
    },

    async getSummary() {
      return options.store.getOperatorActionSummary();
    }
  };
}
