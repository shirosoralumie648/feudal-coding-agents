import type { ACPAgentManifest } from "@feudal/acp";
import type { OperatorActionRecord, OperatorActionSummary, TaskRecord } from "@feudal/contracts";
import {
  fetchAgents,
  fetchOperatorSummary,
  fetchRecoverySummary,
  fetchTaskDiffs,
  fetchTaskEvents,
  fetchTaskOperatorActions,
  fetchTasks,
  type RecoverySummary,
  type TaskConsoleRecord,
  type TaskDiffEntry,
  type TaskEventSummary
} from "./api";

export interface ConsoleBootstrapData {
  tasks: TaskConsoleRecord[];
  agents: ACPAgentManifest[];
  recoverySummary: RecoverySummary;
  operatorSummary: OperatorActionSummary;
  operatorSummaryLoaded: boolean;
  initialTaskId?: string;
  initialEvents?: TaskEventSummary[];
  initialDiffs?: TaskDiffEntry[];
  initialOperatorActions?: OperatorActionRecord[];
}

export interface TaskContextData {
  taskId: string;
  events?: TaskEventSummary[];
  diffs?: TaskDiffEntry[];
  operatorActions?: OperatorActionRecord[];
  operatorSummary?: OperatorActionSummary;
  operatorSummaryLoaded: boolean;
}

export interface RefreshOperatorContextData {
  taskId: string;
  events?: TaskEventSummary[];
  diffs?: TaskDiffEntry[];
  operatorActions?: OperatorActionRecord[];
  operatorSummary?: OperatorActionSummary;
  operatorSummaryLoaded: boolean;
}

export function createEmptyOperatorSummary(): OperatorActionSummary {
  return {
    tasksNeedingOperatorAttention: 0,
    tasks: []
  };
}

export function mergeLoadedTasks(
  currentTasks: TaskConsoleRecord[],
  loadedTasks: TaskConsoleRecord[]
) {
  if (currentTasks.length === 0) {
    return loadedTasks;
  }

  const currentTaskIds = new Set(currentTasks.map((task) => task.id));
  return [
    ...currentTasks,
    ...loadedTasks.filter((task) => !currentTaskIds.has(task.id))
  ];
}

export async function loadConsoleBootstrap(): Promise<ConsoleBootstrapData> {
  const [tasks, agents, recoverySummary, operatorSummaryResult] = await Promise.all([
    fetchTasks(),
    fetchAgents(),
    fetchRecoverySummary(),
    fetchOperatorSummary()
      .then((summary) => ({
        loaded: true,
        summary
      }))
      .catch(() => ({
        loaded: false,
        summary: createEmptyOperatorSummary()
      }))
  ]);

  const initialTaskId = tasks[0]?.id;
  const [initialEvents, initialDiffs, initialOperatorActions] = initialTaskId
    ? await Promise.allSettled([
        fetchTaskEvents(initialTaskId),
        fetchTaskDiffs(initialTaskId),
        fetchTaskOperatorActions(initialTaskId)
      ])
    : [];

  return {
    tasks,
    agents,
    recoverySummary,
    operatorSummary: operatorSummaryResult.summary,
    operatorSummaryLoaded: operatorSummaryResult.loaded,
    initialTaskId,
    initialEvents: initialEvents?.status === "fulfilled" ? initialEvents.value : undefined,
    initialDiffs: initialDiffs?.status === "fulfilled" ? initialDiffs.value : undefined,
    initialOperatorActions:
      initialOperatorActions?.status === "fulfilled"
        ? initialOperatorActions.value
        : undefined
  };
}

export async function loadTaskContext(options: {
  taskId: string;
  events?: TaskEventSummary[];
  diffs?: TaskDiffEntry[];
  operatorActions?: OperatorActionRecord[];
  operatorSummary?: OperatorActionSummary;
  needsOperatorSummary: boolean;
}) {
  const [events, diffs, operatorActions, operatorSummary] = await Promise.allSettled([
    options.events ? Promise.resolve(options.events) : fetchTaskEvents(options.taskId),
    options.diffs ? Promise.resolve(options.diffs) : fetchTaskDiffs(options.taskId),
    options.operatorActions
      ? Promise.resolve(options.operatorActions)
      : fetchTaskOperatorActions(options.taskId),
    options.needsOperatorSummary
      ? fetchOperatorSummary()
      : Promise.resolve(options.operatorSummary ?? createEmptyOperatorSummary())
  ]);

  return {
    taskId: options.taskId,
    events: events.status === "fulfilled" ? events.value : undefined,
    diffs: diffs.status === "fulfilled" ? diffs.value : undefined,
    operatorActions:
      operatorActions.status === "fulfilled" ? operatorActions.value : undefined,
    operatorSummary:
      operatorSummary.status === "fulfilled" ? operatorSummary.value : undefined,
    operatorSummaryLoaded: operatorSummary.status === "fulfilled"
  } satisfies TaskContextData;
}

export async function refreshOperatorContext(taskId: string) {
  const [operatorActions, operatorSummary, events, diffs] = await Promise.allSettled([
    fetchTaskOperatorActions(taskId),
    fetchOperatorSummary(),
    fetchTaskEvents(taskId),
    fetchTaskDiffs(taskId)
  ]);

  return {
    taskId,
    operatorActions:
      operatorActions.status === "fulfilled" ? operatorActions.value : undefined,
    operatorSummary:
      operatorSummary.status === "fulfilled" ? operatorSummary.value : undefined,
    operatorSummaryLoaded: operatorSummary.status === "fulfilled",
    events: events.status === "fulfilled" ? events.value : undefined,
    diffs: diffs.status === "fulfilled" ? diffs.value : undefined
  } satisfies RefreshOperatorContextData;
}
