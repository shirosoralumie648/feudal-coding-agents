import { startTransition, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ACPAgentManifest } from "@feudal/acp";
import type { TaskRecord, TaskStatus } from "@feudal/contracts";

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

function formatArtifact(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (content && typeof content === "object") {
    return Object.values(content as Record<string, unknown>)
      .filter((value) => typeof value === "string")
      .join(" ");
  }

  return "No artifact summary available.";
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json() as Promise<T>;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return response.json() as Promise<T>;
}

export function App() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [agents, setAgents] = useState<ACPAgentManifest[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeApprovalId, setActiveApprovalId] = useState<string>();
  const [draft, setDraft] = useState({
    title: "",
    prompt: "",
    sensitivity: "medium",
    requiresApproval: true
  });

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchJson<TaskRecord[]>("/api/tasks"),
      fetchJson<ACPAgentManifest[]>("/api/agents")
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
      const createdTask = await requestJson<TaskRecord>("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          prompt: draft.prompt.trim(),
          allowMock: true,
          requiresApproval: draft.requiresApproval,
          sensitivity: draft.sensitivity
        })
      });

      startTransition(() => {
        upsertTask(createdTask);
        setSelectedTaskId(createdTask.id);
        setDraft({
          title: "",
          prompt: "",
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
      const approvedTask = await requestJson<TaskRecord>(`/api/tasks/${taskId}/approve`, {
        method: "POST"
      });

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
              <strong>{selectedTask?.runIds.length ?? 0}</strong>
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

        <section className="panel panel-form">
          <div className="panel-header">
            <h2>New Task</h2>
            <span>Phase 1 intake</span>
          </div>

          <form className="task-form" onSubmit={handleTaskSubmit}>
            <label>
              Title
              <input
                name="title"
                placeholder="Refine ACP execution flow"
                value={draft.title}
                onChange={(event) => handleDraftChange("title", event)}
              />
            </label>
            <label>
              Prompt
              <textarea
                name="prompt"
                placeholder="Describe the coding objective, constraints, and desired artifact."
                rows={5}
                value={draft.prompt}
                onChange={(event) => handleDraftChange("prompt", event)}
              />
            </label>
            <div className="form-row">
              <label>
                Sensitivity
                <select
                  name="sensitivity"
                  value={draft.sensitivity}
                  onChange={(event) => handleDraftChange("sensitivity", event)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="checkbox-field">
                <input
                  checked={draft.requiresApproval}
                  type="checkbox"
                  name="requiresApproval"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      requiresApproval: event.target.checked
                    }))
                  }
                />
                Require approval gate
              </label>
            </div>
            <button disabled={!canSubmit} type="submit">
              {isSubmitting ? "Submitting..." : "Submit task"}
            </button>
          </form>
        </section>

        <section className="panel panel-detail">
          <div className="panel-header">
            <h2>Task Detail</h2>
            <span>{selectedTask?.status ? laneLabels[selectedTask.status] : "Idle"}</span>
          </div>

          {selectedTask ? (
            <div className="detail-stack">
              <article className="task-summary">
                <h3>{selectedTask.title}</h3>
                <p>{selectedTask.prompt}</p>
              </article>

              <article>
                <h3>Artifacts</h3>
                <ul className="detail-list">
                  {selectedTask.artifacts.map((artifact) => (
                    <li key={artifact.id}>
                      <strong>{artifact.name}</strong>
                      <span>{formatArtifact(artifact.content)}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article>
                <h3>Timeline</h3>
                <ol className="detail-list">
                  {selectedTask.history.map((entry) => (
                    <li key={`${entry.at}-${entry.note}`}>
                      <strong>{laneLabels[entry.status]}</strong>
                      <span>{entry.note}</span>
                    </li>
                  ))}
                </ol>
              </article>
            </div>
          ) : (
            <p className="empty-state">Submit a task to populate the control plane.</p>
          )}
        </section>

        <section className="panel panel-approval">
          <div className="panel-header">
            <h2>Approval Inbox</h2>
            <span>{awaitingTasks.length} waiting</span>
          </div>

          <ul className="detail-list">
            {awaitingTasks.map((task) => (
              <li key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.status}</span>
                </div>
                <button
                  type="button"
                  disabled={activeApprovalId === task.id}
                  onClick={() => void handleApprove(task.id)}
                >
                  {activeApprovalId === task.id
                    ? `Approving ${task.title}...`
                    : `Approve ${task.title}`}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel panel-agents">
          <div className="panel-header">
            <h2>Agent Registry</h2>
            <span>{agents.length} available</span>
          </div>

          <ul className="registry-list">
            {agents.map((agent) => (
              <li key={agent.name}>
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </div>
                <p>{agent.description}</p>
                <small>{agent.capabilities.join(" / ")}</small>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
