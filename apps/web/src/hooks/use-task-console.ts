import { startTransition, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ACPAgentManifest } from "@feudal/acp";
import type {
  OperatorActionRecord,
  OperatorActionSummary,
  OperatorActionType,
  TaskRecord
} from "@feudal/contracts";
import {
  type CreateTaskInput,
  type RecoverySummary,
  type TaskConsoleRecord,
  type TaskDiffEntry,
  type TaskEventSummary
} from "../lib/api";
import {
  createEmptyOperatorSummary,
  loadConsoleBootstrap,
  loadTaskContext,
  mergeLoadedTasks,
  refreshOperatorContext
} from "../lib/console-data";
import {
  runGovernanceAction,
  runOperatorAction,
  submitTaskDraft
} from "../lib/console-actions";
import { fetchTaskReplay } from "../lib/api";
import { getUrlState, updateUrlState } from "../lib/url-state";

type GovernanceActionType = "approve" | "reject" | "revise";

export function useTaskConsole() {
  const [tasks, setTasks] = useState<TaskConsoleRecord[]>([]);
  const [agents, setAgents] = useState<ACPAgentManifest[]>([]);
  const [taskEvents, setTaskEvents] = useState<Record<string, TaskEventSummary[]>>({});
  const [taskDiffs, setTaskDiffs] = useState<Record<string, TaskDiffEntry[]>>({});
  const [operatorActions, setOperatorActions] = useState<
    Record<string, OperatorActionRecord[]>
  >({});
  const [operatorSummary, setOperatorSummary] = useState<OperatorActionSummary>(
    createEmptyOperatorSummary()
  );
  const [operatorSummaryLoaded, setOperatorSummaryLoaded] = useState(false);
  const [operatorSummaryRetryNonce, setOperatorSummaryRetryNonce] = useState(0);
  const [taskReplay, setTaskReplay] = useState<
    Record<string, Pick<TaskRecord, "id" | "title" | "status">>
  >({});
  const [recoverySummary, setRecoverySummary] = useState<RecoverySummary>({
    tasksNeedingRecovery: 0,
    runsNeedingRecovery: 0,
    taskBreakdown: {
      healthy: 0,
      replaying: 0,
      recoveryRequired: 0
    },
    runRecoveryBreakdown: {
      healthy: 0,
      replaying: 0,
      recoveryRequired: 0
    },
    runStatusBreakdown: {
      created: 0,
      inProgress: 0,
      awaiting: 0,
      completed: 0,
      failed: 0,
      cancelling: 0,
      cancelled: 0
    }
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    () => getUrlState().selectedTaskId ?? ""
  );
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeGovernanceId, setActiveGovernanceId] = useState<string>();
  const [activeOperatorAction, setActiveOperatorAction] = useState<
    { taskId: string; action: OperatorActionType } | undefined
  >();
  const [governanceErrorByTaskId, setGovernanceErrorByTaskId] = useState<
    Record<string, string | undefined>
  >({});
  const [operatorErrorByTaskId, setOperatorErrorByTaskId] = useState<
    Record<string, string | undefined>
  >({});
  const [operatorDrafts, setOperatorDrafts] = useState<Record<string, string>>({});
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<CreateTaskInput>({
    title: "",
    prompt: "",
    allowMock: false,
    sensitivity: "medium",
    requiresApproval: true
  });

  useEffect(() => {
    let active = true;

    loadConsoleBootstrap()
      .then((data) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setTasks((current) => mergeLoadedTasks(current, data.tasks));
          setAgents(data.agents);
          setRecoverySummary(data.recoverySummary);
          setOperatorSummary(data.operatorSummary);
          setOperatorSummaryLoaded(data.operatorSummaryLoaded);
          setSelectedTaskId((current) => current ?? data.initialTaskId);

          if (data.initialTaskId) {
            if (data.initialEvents) {
              setTaskEvents((current) => ({
                ...current,
                [data.initialTaskId!]: data.initialEvents!
              }));
            }

            if (data.initialDiffs) {
              setTaskDiffs((current) => ({
                ...current,
                [data.initialTaskId!]: data.initialDiffs!
              }));
            }

            if (data.initialOperatorActions) {
              setOperatorActions((current) => ({
                ...current,
                [data.initialTaskId!]: data.initialOperatorActions!
              }));
            }
          }

          setError(undefined);
        });
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load control-plane data."
        );
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (operatorSummaryLoaded || tasks.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOperatorSummaryRetryNonce((current) => current + 1);
    }, 2_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [operatorSummaryLoaded, operatorSummaryRetryNonce, tasks.length]);

  useEffect(() => {
    const taskId = selectedTaskId || tasks[0]?.id;
    const hasEvents = taskId ? taskEvents[taskId] : undefined;
    const hasDiffs = taskId ? taskDiffs[taskId] : undefined;
    const hasOperatorActions = taskId ? operatorActions[taskId] : undefined;
    const needsOperatorSummary = !operatorSummaryLoaded;

    if (
      !taskId ||
      (hasEvents && hasDiffs && hasOperatorActions && !needsOperatorSummary)
    ) {
      return;
    }

    let active = true;

    loadTaskContext({
      taskId,
      events: hasEvents,
      diffs: hasDiffs,
      operatorActions: hasOperatorActions,
      operatorSummary,
      needsOperatorSummary
    })
      .then((context) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          if (context.events) {
            setTaskEvents((current) => ({ ...current, [taskId]: context.events! }));
          }

          if (context.diffs) {
            setTaskDiffs((current) => ({ ...current, [taskId]: context.diffs! }));
          }

          if (context.operatorActions) {
            setOperatorActions((current) => ({
              ...current,
              [taskId]: context.operatorActions!
            }));
          }

          if (context.operatorSummary) {
            setOperatorSummary(context.operatorSummary);
          }
          setOperatorSummaryLoaded(context.operatorSummaryLoaded);
        });
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return;
        }

        setError(
          nextError instanceof Error ? nextError.message : "Unable to load replay data."
        );
      });

    return () => {
      active = false;
    };
  }, [
    operatorActions,
    operatorSummary,
    operatorSummaryLoaded,
    operatorSummaryRetryNonce,
    selectedTaskId,
    taskDiffs,
    taskEvents,
    tasks
  ]);

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const selectedTaskEvents = selectedTask ? taskEvents[selectedTask.id] ?? [] : [];
  const selectedTaskDiffs = selectedTask ? taskDiffs[selectedTask.id] ?? [] : [];
  const selectedTaskOperatorActions = selectedTask
    ? operatorActions[selectedTask.id] ?? []
    : [];
  const selectedReplayTask = selectedTask ? taskReplay[selectedTask.id] : undefined;
  const awaitingTasks = tasks.filter((task) => task.status === "awaiting_approval");
  const governanceTasks = tasks.filter((task) => {
    if (task.status === "awaiting_approval") {
      return true;
    }

    if (task.governance) {
      return task.governance.allowedActions.length > 0;
    }

    return false;
  });
  const recoveryCount =
    recoverySummary.tasksNeedingRecovery + recoverySummary.runsNeedingRecovery;
  const recoveryLabel = recoveryCount > 0 ? "Recovery Required" : "Recovery Clear";
  const canSubmit =
    draft.title.trim().length > 0 && draft.prompt.trim().length > 0 && !isSubmitting;

  function upsertTask(nextTask: TaskConsoleRecord) {
    setTasks((current) => {
      const existingIndex = current.findIndex((task) => task.id === nextTask.id);

      if (existingIndex === -1) {
        return [nextTask, ...current];
      }

      const nextTasks = [...current];
      nextTasks[existingIndex] = nextTask;
      return nextTasks;
    });
  }

  function selectTask(taskId: string | undefined) {
    setSelectedTaskId(taskId ?? "");
    updateUrlState({ selectedTaskId: taskId, replayEventId: undefined });
    // Clear replay when switching tasks
    setTaskReplay((current) => {
      if (!taskId) return current;
      const { [taskId]: _, ...rest } = current;
      return rest;
    });
  }

  async function refreshSelectedOperatorContext(taskId: string) {
    const context = await refreshOperatorContext(taskId);

    startTransition(() => {
      if (context.operatorActions) {
        setOperatorActions((current) => ({
          ...current,
          [taskId]: context.operatorActions!
        }));
      }

      if (context.operatorSummary) {
        setOperatorSummary(context.operatorSummary);
      }
      setOperatorSummaryLoaded(context.operatorSummaryLoaded);

      if (context.events) {
        setTaskEvents((current) => ({ ...current, [taskId]: context.events! }));
      }

      if (context.diffs) {
        setTaskDiffs((current) => ({ ...current, [taskId]: context.diffs! }));
      }
    });
  }

  function handleDraftChange(
    field: "title" | "prompt" | "sensitivity",
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const value = event.target.value;
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      const createdTask = await submitTaskDraft(draft);

      startTransition(() => {
        upsertTask(createdTask);
        selectTask(createdTask.id);
        setDraft({
          title: "",
          prompt: "",
          allowMock: false,
          sensitivity: "medium",
          requiresApproval: true
        });
        setError(undefined);
      });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to submit the task."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGovernanceAction(
    taskId: string,
    action: GovernanceActionType,
    note?: string
  ) {
    setActiveGovernanceId(taskId);

    try {
      const nextTask = await runGovernanceAction(taskId, action, note);

      startTransition(() => {
        upsertTask(nextTask);
        selectTask(nextTask.id);
        setGovernanceErrorByTaskId((current) => ({ ...current, [taskId]: undefined }));
        if (action === "revise") {
          setRevisionDrafts((current) => ({ ...current, [taskId]: "" }));
        }
        setError(undefined);
      });
    } catch (nextError: unknown) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : action === "approve"
            ? "Unable to approve the task."
            : action === "reject"
              ? "Unable to reject the task."
              : "Unable to submit the revision note.";
      setGovernanceErrorByTaskId((current) => ({ ...current, [taskId]: message }));
    } finally {
      setActiveGovernanceId(undefined);
    }
  }

  async function handleReplay(taskId: string, eventId: number) {
    try {
      const replay = await fetchTaskReplay(taskId, eventId);

      startTransition(() => {
        setTaskReplay((current) => ({ ...current, [taskId]: replay.task }));
        updateUrlState({ replayEventId: eventId });
        setError(undefined);
      });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to replay the selected task snapshot."
      );
    }
  }

  async function handleOperatorAction(taskId: string, action: OperatorActionType) {
    if (activeOperatorAction) {
      return;
    }

    const note = operatorDrafts[taskId]?.trim();

    if (!note) {
      return;
    }

    if (action === "abandon" && !window.confirm("Abandon this task?")) {
      return;
    }

    setActiveOperatorAction({ taskId, action });

    try {
      const nextTask = await runOperatorAction(taskId, action, note);

      startTransition(() => {
        upsertTask(nextTask);
        selectTask(nextTask.id);
        setOperatorErrorByTaskId((current) => ({ ...current, [taskId]: undefined }));
        setOperatorDrafts((current) => ({ ...current, [taskId]: "" }));
        setError(undefined);
      });

      await refreshSelectedOperatorContext(taskId);
    } catch (nextError: unknown) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Unable to execute the operator action.";
      setOperatorErrorByTaskId((current) => ({ ...current, [taskId]: message }));
    } finally {
      setActiveOperatorAction(undefined);
    }
  }

  return {
    activeGovernanceId,
    activeOperatorAction,
    agents,
    awaitingTasks,
    canSubmit,
    draft,
    error,
    governanceTasks,
    governanceErrorByTaskId,
    handleDraftChange,
    handleGovernanceAction,
    handleOperatorAction,
    handleReplay,
    handleTaskSubmit,
    isSubmitting,
    operatorDrafts,
    operatorErrorByTaskId,
    operatorSummary,
    recoveryCount,
    recoveryLabel,
    revisionDrafts,
    selectedReplayTask,
    selectedTask,
    selectedTaskDiffs,
    selectedTaskEvents,
    selectedTaskOperatorActions,
    selectTask,
    setDraft,
    setOperatorDrafts,
    setRevisionDrafts,
    tasks
  };
}
