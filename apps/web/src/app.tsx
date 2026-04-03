import { startTransition, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ACPAgentManifest } from "@feudal/acp";
import type { TaskRecord, TaskStatus } from "@feudal/contracts";
import { AgentRegistryPanel } from "./components/agent-registry-panel";
import { ApprovalInboxPanel } from "./components/approval-inbox-panel";
import { NewTaskPanel } from "./components/new-task-panel";
import { TaskDetailPanel } from "./components/task-detail-panel";
import {
  approveTask,
  createTask,
  fetchAgents,
  fetchTasks,
  type CreateTaskInput
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
  needs_revision: "Needs Revision",
  partial_success: "Partial Success",
  rejected: "Rejected",
  failed: "Failed",
  rolled_back: "Rolled Back"
};

export function App() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [agents, setAgents] = useState<ACPAgentManifest[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeApprovalId, setActiveApprovalId] = useState<string>();
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
      fetchAgents()
    ])
      .then(([nextTasks, nextAgents]) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setTasks(nextTasks);
          setAgents(nextAgents);
          setSelectedTaskId((current) => current ?? nextTasks[0]?.id);
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

  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const awaitingTasks = tasks.filter((task) => task.status === "awaiting_approval");
  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    !isSubmitting;

  function upsertTask(nextTask: TaskRecord) {
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

  async function handleApprove(taskId: string) {
    setActiveApprovalId(taskId);

    try {
      const approvedTask = await approveTask(taskId);

      startTransition(() => {
        upsertTask(approvedTask);
        setSelectedTaskId(approvedTask.id);
        setError(undefined);
      });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to approve the task."
      );
    } finally {
      setActiveApprovalId(undefined);
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
          onRequiresApprovalChange={(checked) =>
            setDraft((current) => ({ ...current, requiresApproval: checked }))
          }
        />
        <TaskDetailPanel laneLabels={laneLabels} selectedTask={selectedTask} />
        <ApprovalInboxPanel
          activeApprovalId={activeApprovalId}
          onApprove={handleApprove}
          tasks={awaitingTasks}
        />
        <AgentRegistryPanel agents={agents} />
      </main>
    </div>
  );
}
