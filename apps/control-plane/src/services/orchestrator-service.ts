import type { ACPClient } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import type { TaskSpec } from "@feudal/contracts";
import { MemoryTaskStore, type TaskStore } from "../store";
import { createGovernanceCoordinator } from "./governance-coordinator";
import {
  ActionNotAllowedError,
  createStepRunners
} from "./orchestrator-runtime";
import {
  type GovernanceCoordinator,
  type OperatorCoordinator,
  type OrchestratorService,
  type ReplayCoordinator,
  type TaskCoordinator
} from "./orchestrator-types";
import { createOperatorCoordinator } from "./operator-coordinator";
import { createReplayCoordinator } from "./replay-coordinator";
import { createTaskCoordinator } from "./task-coordinator";
import { createTaskRunGateway, type TaskRunGateway } from "./task-run-gateway";

export { ActionNotAllowedError };
export type {
  GovernanceCoordinator,
  OperatorCoordinator,
  OrchestratorService,
  ReplayCoordinator,
  TaskCoordinator
} from "./orchestrator-types";

export function createOrchestratorService(options: {
  runGateway?: TaskRunGateway;
  acpClient?: ACPClient;
  store?: TaskStore;
}): OrchestratorService {
  const runGateway =
    options.runGateway ??
    (options.acpClient
      ? createTaskRunGateway({
          realClient: options.acpClient,
          mockClient: createMockACPClient()
        })
      : undefined);

  if (!runGateway) {
    throw new Error("Either runGateway or acpClient must be provided");
  }

  const store = options.store ?? new MemoryTaskStore();
  const { runStep, awaitStep } = createStepRunners({ runGateway });
  const coordinator = createTaskCoordinator({
    store,
    runGateway,
    runStep,
    awaitStep
  });
  const governance = createGovernanceCoordinator({
    store,
    runGateway,
    runStep,
    awaitStep
  });
  const operator = createOperatorCoordinator({
    store,
    listAgents: () => runGateway.listAgents(),
    runStep,
    awaitStep
  });
  const replay = createReplayCoordinator({ store });

  return {
    coordinator,
    governance,
    operator,
    replay,

    async createTask(spec: TaskSpec) {
      return coordinator.createTask(spec);
    },

    async submitGovernanceAction(taskId, action, note) {
      return governance.submitAction(taskId, action, note);
    },

    async approveTask(taskId) {
      return governance.submitAction(taskId, "approve");
    },

    async rejectTask(taskId) {
      return governance.submitAction(taskId, "reject");
    },

    async submitRevision(taskId, note) {
      return governance.submitAction(taskId, "revise", note);
    },

    async recoverTask(taskId, note) {
      return operator.recover(taskId, note);
    },

    async takeoverTask(taskId, note) {
      return operator.takeover(taskId, note);
    },

    async abandonTask(taskId, note) {
      return operator.abandon(taskId, note);
    },

    async listTasks() {
      return coordinator.listTasks();
    },

    async getTask(taskId) {
      return coordinator.getTask(taskId);
    },

    async listOperatorActions(taskId) {
      return operator.listActions(taskId);
    },

    async getOperatorActionSummary() {
      return operator.getSummary();
    },

    async listTaskEvents(taskId) {
      return replay.listEvents(taskId);
    },

    async listTaskDiffs(taskId) {
      return replay.listDiffs(taskId);
    },

    async listTaskRuns(taskId) {
      return replay.listRuns(taskId);
    },

    async listTaskArtifacts(taskId) {
      return replay.listArtifacts(taskId);
    },

    async replayTaskAtEventId(taskId, eventId) {
      return replay.replayTaskAtEventId(taskId, eventId);
    },

    async getRecoverySummary() {
      return replay.getRecoverySummary();
    },

    async rebuildProjectionsIfNeeded() {
      await coordinator.rebuildProjectionsIfNeeded();
    },

    async listAgents() {
      return coordinator.listAgents();
    }
  };
}
