import type { ACPClient } from "@feudal/acp";
import type { TaskAction, TaskSpec } from "@feudal/contracts";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import type { TaskStore } from "../store";

export interface GovernanceCoordinator {
  submitAction(
    taskId: string,
    action: TaskAction,
    note?: string
  ): Promise<TaskProjectionRecord>;
}

export interface OperatorCoordinator {
  recover(taskId: string, note: string): Promise<TaskProjectionRecord>;
  takeover(taskId: string, note: string): Promise<TaskProjectionRecord>;
  abandon(taskId: string, note: string): Promise<TaskProjectionRecord>;
  listActions(taskId: string): ReturnType<TaskStore["listOperatorActions"]>;
  getSummary(): ReturnType<TaskStore["getOperatorActionSummary"]>;
}

export interface ReplayCoordinator {
  listEvents(taskId: string): ReturnType<TaskStore["listTaskEvents"]>;
  listDiffs(taskId: string): ReturnType<TaskStore["listTaskDiffs"]>;
  listRuns(taskId: string): ReturnType<TaskStore["listTaskRuns"]>;
  listArtifacts(taskId: string): ReturnType<TaskStore["listTaskArtifacts"]>;
  replayTaskAtEventId(
    taskId: string,
    eventId: number
  ): ReturnType<TaskStore["replayTaskAtEventId"]>;
  getRecoverySummary(): ReturnType<TaskStore["getRecoverySummary"]>;
}

export interface TaskCoordinator {
  createTask(spec: TaskSpec): Promise<TaskProjectionRecord>;
  listTasks(): Promise<TaskProjectionRecord[]>;
  getTask(taskId: string): Promise<TaskProjectionRecord | undefined>;
  rebuildProjectionsIfNeeded(): ReturnType<TaskStore["rebuildProjectionsIfNeeded"]>;
  listAgents(): ReturnType<ACPClient["listAgents"]>;
}

export interface OrchestratorService {
  createTask(spec: TaskSpec): Promise<TaskProjectionRecord>;
  submitGovernanceAction(
    taskId: string,
    action: TaskAction,
    note?: string
  ): Promise<TaskProjectionRecord>;
  approveTask(taskId: string): Promise<TaskProjectionRecord>;
  rejectTask(taskId: string): Promise<TaskProjectionRecord>;
  submitRevision(taskId: string, note: string): Promise<TaskProjectionRecord>;
  recoverTask(taskId: string, note: string): Promise<TaskProjectionRecord>;
  takeoverTask(taskId: string, note: string): Promise<TaskProjectionRecord>;
  abandonTask(taskId: string, note: string): Promise<TaskProjectionRecord>;
  listTasks(): Promise<TaskProjectionRecord[]>;
  getTask(taskId: string): Promise<TaskProjectionRecord | undefined>;
  listOperatorActions(taskId: string): ReturnType<TaskStore["listOperatorActions"]>;
  getOperatorActionSummary(): ReturnType<TaskStore["getOperatorActionSummary"]>;
  listTaskEvents(taskId: string): ReturnType<TaskStore["listTaskEvents"]>;
  listTaskDiffs(taskId: string): ReturnType<TaskStore["listTaskDiffs"]>;
  listTaskRuns(taskId: string): ReturnType<TaskStore["listTaskRuns"]>;
  listTaskArtifacts(taskId: string): ReturnType<TaskStore["listTaskArtifacts"]>;
  replayTaskAtEventId(
    taskId: string,
    eventId: number
  ): ReturnType<TaskStore["replayTaskAtEventId"]>;
  getRecoverySummary(): ReturnType<TaskStore["getRecoverySummary"]>;
  rebuildProjectionsIfNeeded(): ReturnType<TaskStore["rebuildProjectionsIfNeeded"]>;
  listAgents(): ReturnType<ACPClient["listAgents"]>;
  readonly coordinator: TaskCoordinator;
  readonly governance: GovernanceCoordinator;
  readonly operator: OperatorCoordinator;
  readonly replay: ReplayCoordinator;
}
