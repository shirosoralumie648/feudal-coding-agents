import { transitionTask } from "@feudal/orchestrator";
import type { TaskStore } from "../store";
import {
  ensureGovernance
} from "./task-metadata";
import {
  runExecutionAndVerification,
  runPlanningReviewAndBranch,
  updateExistingRunSummary
} from "./orchestrator-flows";
import type { GovernanceCoordinator } from "./orchestrator-types";
import {
  ActionNotAllowedError,
  assertActionAllowed,
  assertApprovalActionAllowed,
  createPersistTask,
  type AwaitStep,
  type RunStep
} from "./orchestrator-runtime";
import type { TaskRunGateway } from "./task-run-gateway";
import { currentExecutionMode } from "./task-metadata";

export function createGovernanceCoordinator(options: {
  store: TaskStore;
  runGateway: TaskRunGateway;
  runStep: RunStep;
  awaitStep: AwaitStep;
}): GovernanceCoordinator {
  return {
    async submitAction(taskId, action, note) {
      const current = await options.store.getTask(taskId);

      if (!current) {
        if (action === "approve" || action === "reject") {
          throw new Error(`Task ${taskId} is not awaiting approval`);
        }

        throw new Error(`Task ${taskId} not found`);
      }

      if (
        (action === "approve" || action === "reject") &&
        current.status !== "awaiting_approval"
      ) {
        throw new ActionNotAllowedError(taskId, action);
      }

      assertActionAllowed(current, action);
      assertApprovalActionAllowed(current, action);

      if (action === "approve" || action === "reject") {
        if (!current.approvalRunId) {
          throw new Error(`Task ${taskId} is missing approval run state`);
        }

        const persistTask = createPersistTask({
          store: options.store,
          initialVersion: current.latestProjectionVersion
        });
        const resumedApprovalRun = await options.runGateway.respondToAwait(
          { executionMode: currentExecutionMode(current) },
          current.approvalRunId,
          {
            role: "user",
            content: action
          }
        );

        let task = transitionTask(current, {
          type: action === "approve" ? "approval.granted" : "approval.rejected"
        });
        task = updateExistingRunSummary(task, resumedApprovalRun, "approval");
        task = {
          ...task,
          approvalRunId: undefined,
          approvalRequest: undefined
        };

        if (action === "approve") {
          // Persist gate consumption before execution so replay shows approval resolution
          // ahead of executor/verifier side effects.
          await persistTask(task, "task.approved");

          return runExecutionAndVerification({
            task,
            persistTask,
            runMetadata: { taskId },
            runStep: options.runStep
          });
        }

        return persistTask(task, "task.rejected");
      }

      const trimmedNote = note?.trim() ?? "";

      if (trimmedNote.length === 0) {
        throw new Error("Revision note must not be empty");
      }

      const persistTask = createPersistTask({
        store: options.store,
        initialVersion: current.latestProjectionVersion
      });
      const governanceState = ensureGovernance(current);
      let task = transitionTask(current, { type: "revision.submitted" });
      task = {
        ...task,
        governance: {
          ...governanceState,
          reviewVerdict: "pending",
          revisionCount: governanceState.revisionCount + 1
        },
        revisionRequest: undefined
      };
      await persistTask(task, "task.revision_submitted");

      return runPlanningReviewAndBranch({
        task,
        persistTask,
        runMetadata: { taskId },
        revisionNote: trimmedNote,
        listAgents: () => options.runGateway.listAgents(),
        runStep: options.runStep,
        awaitStep: options.awaitStep
      });
    }
  };
}
