import { transitionTask } from "@feudal/orchestrator";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import type { TaskStore } from "../store";
import { createTaskGovernance } from "../governance/policy";
import {
  appendArtifact,
  appendRun,
  runPlanningReviewAndBranch
} from "./orchestrator-flows";
import type { TaskCoordinator } from "./orchestrator-types";
import {
  createPersistTask,
  type AwaitStep,
  type RunStep
} from "./orchestrator-runtime";
import type { TaskRunGateway } from "./task-run-gateway";
import type { TaskSpec } from "@feudal/contracts";

function newTask(spec: TaskSpec): TaskProjectionRecord {
  const now = new Date().toISOString();

  return {
    id: spec.id,
    title: spec.title,
    prompt: spec.prompt,
    status: "draft",
    artifacts: [],
    history: [],
    runIds: [],
    runs: [],
    operatorAllowedActions: [],
    governance: createTaskGovernance(spec),
    createdAt: now,
    updatedAt: now,
    recoveryState: "healthy",
    latestEventId: 0,
    latestProjectionVersion: 0
  };
}

export function createTaskCoordinator(options: {
  store: TaskStore;
  runGateway: TaskRunGateway;
  runStep: RunStep;
  awaitStep: AwaitStep;
}): TaskCoordinator {
  return {
    async createTask(spec) {
      const runMetadata = { taskId: spec.id };
      let task = transitionTask(newTask(spec), { type: "task.submitted" });
      const persistTask = createPersistTask({
        store: options.store,
        initialVersion: 0
      });

      await persistTask(task, "task.submitted");

      const intakeStep = await options.runStep(task, "intake", {
        agent: "intake-agent",
        messages: [{ role: "user", content: spec.prompt }],
        metadata: runMetadata
      });
      task = intakeStep.task;
      const intakeRun = intakeStep.run;
      task = transitionTask(task, { type: "intake.completed" });
      task = appendArtifact(task, intakeRun.id, "taskspec", intakeRun.artifacts[0]?.content);
      task = appendRun(task, intakeRun, "intake");
      await persistTask(task, "task.intake_completed");

      return runPlanningReviewAndBranch({
        task,
        persistTask,
        runMetadata,
        listAgents: () => options.runGateway.listAgents(),
        runStep: options.runStep,
        awaitStep: options.awaitStep
      });
    },

    async listTasks() {
      return options.store.listTasks();
    },

    async getTask(taskId) {
      return options.store.getTask(taskId);
    },

    async rebuildProjectionsIfNeeded() {
      await options.store.rebuildProjectionsIfNeeded();
    },

    async listAgents() {
      return options.runGateway.listAgents();
    }
  };
}
