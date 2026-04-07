import { startTransition, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ACPAgentManifest } from "@feudal/acp";
import type {
  OperatorActionRecord,
  OperatorActionSummary,
  OperatorActionType,
  TaskRecord,
  TaskStatus
} from "@feudal/contracts";
import { AgentRegistryPanel } from "./components/agent-registry-panel";
import { ApprovalInboxPanel } from "./components/approval-inbox-panel";
import { DiffInspectorPanel } from "./components/diff-inspector-panel";
import { NewTaskPanel } from "./components/new-task-panel";
import { OperatorQueuePanel } from "./components/operator-queue-panel";
import { TaskDetailPanel } from "./components/task-detail-panel";
import { TimelinePanel } from "./components/timeline-panel";
import {
  abandonTask,
  createTask,
  fetchAgents,
  fetchOperatorSummary,
  fetchRecoverySummary,
  fetchTaskOperatorActions,
  fetchTaskDiffs,
  fetchTaskEvents,
  fetchTaskReplay,
  fetchTasks,
  recoverTask,
  submitGovernanceAction,
  takeoverTask,
  type CreateTaskInput,
  type RecoverySummary,
  type TaskConsoleRecord,
  type TaskDiffEntry,
  type TaskEventSummary
} from "./lib/api";

const laneOrder: TaskStatus[] = [
  "intake",
  "planning",
  "review",
  "awaiting_approval",
  "dispatching",
  "executing",
  "verifying",
  "completed"
];

const laneLabels: Record<TaskStatus, string> = {
  draft: "Draft",
  intake: "Intake",
  planning: "Planning",
  review: "Review",
  awaiting_approval: "Awaiting Approval",
  dispatching: "Dispatching",
  executing: "Executing",
  verifying: "Verifying",
  completed: "Completed",
  abandoned: "Abandoned",
  needs_revision: "Needs Revision",
  partial_success: "Partial Success",
  rejected: "Rejected",
  failed: "Failed",
  rolled_back: "Rolled Back"
};

function mergeLoadedTasks(
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

export function App() {
  const [tasks, setTasks] = useState<TaskConsoleRecord[]>([]);
  const [agents, setAgents] = useState<ACPAgentManifest[]>([]);
  const [taskEvents, setTaskEvents] = useState<Record<string, TaskEventSummary[]>>({});
  const [taskDiffs, setTaskDiffs] = useState<Record<string, TaskDiffEntry[]>>({});
  const [operatorActions, setOperatorActions] = useState<
    Record<string, OperatorActionRecord[]>
  >({});
  const [operatorSummary, setOperatorSummary] = useState<OperatorActionSummary>({
    tasksNeedingOperatorAttention: 0,
    tasks: []
  });
  const [operatorSummaryLoaded, setOperatorSummaryLoaded] = useState(false);
  const [operatorSummaryRetryNonce, setOperatorSummaryRetryNonce] = useState(0);
  const [taskReplay, setTaskReplay] = useState<
    Record<string, Pick<TaskRecord, "id" | "title" | "status">>
  >({});
  const [recoverySummary, setRecoverySummary] = useState<RecoverySummary>({
    tasksNeedingRecovery: 0,
    runsNeedingRecovery: 0
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeGovernanceId, setActiveGovernanceId] = useState<string>();
  const [activeOperatorAction, setActiveOperatorAction] = useState<
    { taskId: string; action: OperatorActionType } | undefined
  >();
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

    Promise.all([
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
          summary: {
            tasksNeedingOperatorAttention: 0,
            tasks: []
          }
        }))
    ])
      .then(async ([nextTasks, nextAgents, nextRecovery, nextOperator]) => {
        const initialTaskId = nextTasks[0]?.id;
        const [initialEvents, initialDiffs, initialOperatorActions] = initialTaskId
          ? await Promise.allSettled([
              fetchTaskEvents(initialTaskId),
              fetchTaskDiffs(initialTaskId),
              fetchTaskOperatorActions(initialTaskId)
            ])
          : [];

        if (!active) {
          return;
        }

        startTransition(() => {
          setTasks((current) => mergeLoadedTasks(current, nextTasks));
          setAgents(nextAgents);
          setRecoverySummary(nextRecovery);
          setOperatorSummary(nextOperator.summary);
          setOperatorSummaryLoaded(nextOperator.loaded);
          setSelectedTaskId((current) => current ?? initialTaskId);
          if (initialTaskId) {
            if (initialEvents?.status === "fulfilled") {
              setTaskEvents((current) => ({
                ...current,
                [initialTaskId]: initialEvents.value
              }));
            }

            if (initialDiffs?.status === "fulfilled") {
              setTaskDiffs((current) => ({
                ...current,
                [initialTaskId]: initialDiffs.value
              }));
            }

            if (initialOperatorActions?.status === "fulfilled") {
              setOperatorActions((current) => ({
                ...current,
                [initialTaskId]: initialOperatorActions.value
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
    const taskId = selectedTaskId ?? tasks[0]?.id;

    const hasEvents = Boolean(taskEvents[taskId]);
    const hasDiffs = Boolean(taskDiffs[taskId]);
    const hasOperatorActions = Boolean(operatorActions[taskId]);
    const needsOperatorSummary = !operatorSummaryLoaded;

    if (!taskId || (hasEvents && hasDiffs && hasOperatorActions && !needsOperatorSummary)) {
      return;
    }

    let active = true;

    Promise.allSettled([
      hasEvents ? Promise.resolve(taskEvents[taskId] ?? []) : fetchTaskEvents(taskId),
      hasDiffs ? Promise.resolve(taskDiffs[taskId] ?? []) : fetchTaskDiffs(taskId),
      hasOperatorActions
        ? Promise.resolve(operatorActions[taskId] ?? [])
        : fetchTaskOperatorActions(taskId),
      needsOperatorSummary ? fetchOperatorSummary() : Promise.resolve(operatorSummary)
    ])
      .then(([nextEvents, nextDiffs, nextOperatorActions, nextOperatorSummary]) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          if (nextEvents.status === "fulfilled") {
            setTaskEvents((current) => ({ ...current, [taskId]: nextEvents.value }));
          }

          if (nextDiffs.status === "fulfilled") {
            setTaskDiffs((current) => ({ ...current, [taskId]: nextDiffs.value }));
          }

          if (nextOperatorActions.status === "fulfilled") {
            setOperatorActions((current) => ({
              ...current,
              [taskId]: nextOperatorActions.value
            }));
          }

          if (nextOperatorSummary.status === "fulfilled") {
            setOperatorSummary(nextOperatorSummary.value);
            setOperatorSummaryLoaded(true);
          }
        });
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load replay data."
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
  const recoveryLabel =
    recoveryCount > 0 ? "Recovery Required" : "Recovery Clear";
  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    !isSubmitting;
  type GovernanceActionType = "approve" | "reject" | "revise";

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

  async function refreshOperatorContext(taskId: string) {
    const [nextActions, nextSummary, nextEvents, nextDiffs] = await Promise.allSettled([
      fetchTaskOperatorActions(taskId),
      fetchOperatorSummary(),
      fetchTaskEvents(taskId),
      fetchTaskDiffs(taskId)
    ]);

    startTransition(() => {
      if (nextActions.status === "fulfilled") {
        setOperatorActions((current) => ({ ...current, [taskId]: nextActions.value }));
      }

      if (nextSummary.status === "fulfilled") {
        setOperatorSummary(nextSummary.value);
        setOperatorSummaryLoaded(true);
      } else {
        setOperatorSummaryLoaded(false);
      }

      if (nextEvents.status === "fulfilled") {
        setTaskEvents((current) => ({ ...current, [taskId]: nextEvents.value }));
      }

      if (nextDiffs.status === "fulfilled") {
        setTaskDiffs((current) => ({ ...current, [taskId]: nextDiffs.value }));
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
      const createdTask = await createTask({
        ...draft,
        title: draft.title.trim(),
        prompt: draft.prompt.trim()
      });

      startTransition(() => {
        upsertTask(createdTask);
        setSelectedTaskId(createdTask.id);
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
      const nextTask = await submitGovernanceAction(taskId, action, note);

      startTransition(() => {
        upsertTask(nextTask);
        setSelectedTaskId(nextTask.id);
        if (action === "revise") {
          setRevisionDrafts((current) => ({ ...current, [taskId]: "" }));
        }
        setError(undefined);
      });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : action === "approve"
            ? "Unable to approve the task."
            : action === "reject"
              ? "Unable to reject the task."
              : "Unable to submit the revision note."
      );
    } finally {
      setActiveGovernanceId(undefined);
    }
  }

  async function handleReplay(taskId: string, eventId: number) {
    try {
      const replay = await fetchTaskReplay(taskId, eventId);

      startTransition(() => {
        setTaskReplay((current) => ({ ...current, [taskId]: replay.task }));
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

  async function handleOperatorAction(
    taskId: string,
    action: OperatorActionType,
    run: (taskId: string, note: string) => Promise<TaskConsoleRecord>
  ) {
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
      const nextTask = await run(taskId, note);

      startTransition(() => {
        upsertTask(nextTask);
        setSelectedTaskId(nextTask.id);
        setOperatorDrafts((current) => ({ ...current, [taskId]: "" }));
        setError(undefined);
      });

      await refreshOperatorContext(taskId);
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to execute the operator action."
      );
    } finally {
      setActiveOperatorAction(undefined);
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <p className="eyebrow">Codex Cluster / ACP Control Plane</p>
        <h1>Repository Governance Console</h1>
        <p className="lede">
          Watch one task move through the feudal workflow with visible approvals,
          artifacts, and agent accountability.
        </p>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <main className="console-grid">
        <section className="panel panel-overview">
          <div className="panel-header">
            <h2>Overview</h2>
            <span>{tasks.length} active tasks</span>
          </div>

          <div className="metric-row">
            <article>
              <strong>{awaitingTasks.length}</strong>
              <span>Awaiting approval</span>
            </article>
            <article>
              <strong>{agents.length}</strong>
              <span>Discovered agents</span>
            </article>
            <article>
              <strong>{selectedTask?.runs.length ?? 0}</strong>
              <span>Tracked ACP runs</span>
            </article>
            <article>
              <strong>{recoveryCount}</strong>
              <span>{recoveryLabel}</span>
            </article>
          </div>

          <div className="lane-grid" aria-label="Workflow swimlanes">
            {laneOrder.map((status) => {
              const current = tasks.filter((task) => task.status === status).length;

              return (
                <article key={status} className="lane-card">
                  <span>{laneLabels[status]}</span>
                  <strong>{current}</strong>
                </article>
              );
            })}
          </div>
        </section>

        <NewTaskPanel
          canSubmit={canSubmit}
          draft={draft}
          isSubmitting={isSubmitting}
          onSubmit={handleTaskSubmit}
          onDraftChange={handleDraftChange}
          onAllowMockChange={(checked) =>
            setDraft((current) => ({ ...current, allowMock: checked }))
          }
          onRequiresApprovalChange={(checked) =>
            setDraft((current) => ({ ...current, requiresApproval: checked }))
          }
        />
        <OperatorQueuePanel
          disabled={Boolean(activeOperatorAction)}
          activeTaskId={selectedTask?.id}
          onSelectTask={(taskId) => {
            if (activeOperatorAction) {
              return;
            }

            setSelectedTaskId(taskId);
          }}
          summary={operatorSummary}
        />
        <TaskDetailPanel
          laneLabels={laneLabels}
          operatorActions={selectedTaskOperatorActions}
          operatorNote={selectedTask ? operatorDrafts[selectedTask.id] ?? "" : ""}
          operatorPending={Boolean(activeOperatorAction)}
          onOperatorNoteChange={(value) => {
            if (!selectedTask) {
              return;
            }

            setOperatorDrafts((current) => ({ ...current, [selectedTask.id]: value }));
          }}
          onRecover={() =>
            selectedTask
              ? handleOperatorAction(selectedTask.id, "recover", recoverTask)
              : Promise.resolve()
          }
          onTakeover={() =>
            selectedTask
              ? handleOperatorAction(selectedTask.id, "takeover", takeoverTask)
              : Promise.resolve()
          }
          onAbandon={() =>
            selectedTask
              ? handleOperatorAction(selectedTask.id, "abandon", abandonTask)
              : Promise.resolve()
          }
          onRevisionNoteChange={(value) => {
            if (!selectedTask) {
              return;
            }

            setRevisionDrafts((current) => ({ ...current, [selectedTask.id]: value }));
          }}
          onSubmitRevision={() =>
            selectedTask
              ? handleGovernanceAction(
                  selectedTask.id,
                  "revise",
                  revisionDrafts[selectedTask.id]?.trim()
                )
              : Promise.resolve()
          }
          revisionNote={selectedTask ? revisionDrafts[selectedTask.id] ?? "" : ""}
          revisionPending={activeGovernanceId === selectedTask?.id}
          selectedTask={selectedTask}
        />
        <TimelinePanel
          events={selectedTaskEvents}
          onReplay={(eventId) =>
            selectedTask ? handleReplay(selectedTask.id, eventId) : undefined
          }
          replayTask={selectedReplayTask}
          taskTitle={selectedTask?.title ?? "Task"}
        />
        <DiffInspectorPanel diffs={selectedTaskDiffs} />
        <ApprovalInboxPanel
          activeTaskId={activeGovernanceId}
          onGovernanceAction={handleGovernanceAction}
          tasks={governanceTasks}
        />
        <AgentRegistryPanel agents={agents} />
      </main>
    </div>
  );
}
