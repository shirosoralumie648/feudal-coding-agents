import type { OperatorActionRecord, TaskStatus } from "@feudal/contracts";
import type { TaskConsoleRecord } from "../lib/api";
import {
  getNextWorkflowPhaseLabel,
  getTaskWorkflowPhaseLabel
} from "../lib/workflow-phase";
import { GovernancePanel } from "./governance-panel";
import { OperatorConsolePanel } from "./operator-console-panel";
import { RevisionPanel } from "./revision-panel";

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

interface TaskDetailPanelProps {
  laneLabels: Record<TaskStatus, string>;
  operatorActions: OperatorActionRecord[];
  operatorError?: string;
  operatorNote: string;
  operatorPending: boolean;
  onOperatorNoteChange: (value: string) => void;
  onRecover: () => void | Promise<void>;
  onTakeover: () => void | Promise<void>;
  onAbandon: () => void | Promise<void>;
  onRevisionNoteChange: (value: string) => void;
  onSubmitRevision: () => void | Promise<void>;
  revisionError?: string;
  revisionNote: string;
  revisionPending: boolean;
  selectedTask: TaskConsoleRecord | null;
}

export function TaskDetailPanel(props: TaskDetailPanelProps) {
  const {
    laneLabels,
    operatorActions,
    operatorError,
    operatorNote,
    operatorPending,
    onOperatorNoteChange,
    onRecover,
    onTakeover,
    onAbandon,
    onRevisionNoteChange,
    onSubmitRevision,
    revisionError,
    revisionNote,
    revisionPending,
    selectedTask
  } = props;
  const workflowPhaseLabel = selectedTask
    ? getTaskWorkflowPhaseLabel(selectedTask)
    : undefined;
  const nextWorkflowPhaseLabel = selectedTask
    ? getNextWorkflowPhaseLabel(selectedTask)
    : undefined;

  return (
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
            <div className="task-summary-meta">
              <span>{selectedTask.runs.length} ACP runs</span>
              <span>{selectedTask.artifacts.length} artifacts</span>
            </div>
            <div className="task-summary-meta">
              <span>{`Workflow Phase`}</span>
              <strong>{workflowPhaseLabel}</strong>
              {nextWorkflowPhaseLabel ? (
                <span>{`Next: ${nextWorkflowPhaseLabel}`}</span>
              ) : null}
            </div>
            <div className="task-summary-meta">
              <span>Recovery State</span>
              <strong>{selectedTask.recoveryState ?? "healthy"}</strong>
              {selectedTask.recoveryReason ? (
                <span>{selectedTask.recoveryReason}</span>
              ) : null}
            </div>
          </article>

          <article>
            <h3>ACP Runs</h3>
            <ul className="detail-list">
              {selectedTask.runs.map((run) => (
                <li key={run.id}>
                  <div>
                    <strong>{`Run ${run.id}`}</strong>
                    <span>{`${run.agent} / ${run.status} / ${run.phase}`}</span>
                  </div>
                  {run.allowedActions?.length ? (
                    <small>{run.allowedActions.join(" / ")}</small>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>

          {selectedTask.approvalRequest ? (
            <article className="approval-gate">
              <h3>Approval Gate</h3>
              <p>{selectedTask.approvalRequest.prompt}</p>
              <small>{selectedTask.approvalRequest.actions.join(" / ")}</small>
            </article>
          ) : null}

          <GovernancePanel task={selectedTask} />
          <OperatorConsolePanel
            actions={operatorActions}
            error={operatorError}
            isSubmitting={operatorPending}
            note={operatorNote}
            onAbandon={onAbandon}
            onNoteChange={onOperatorNoteChange}
            onRecover={onRecover}
            onTakeover={onTakeover}
            task={selectedTask}
          />
          <RevisionPanel
            error={revisionError}
            isSubmitting={revisionPending}
            note={revisionNote}
            onNoteChange={onRevisionNoteChange}
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitRevision();
            }}
            task={selectedTask}
          />

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
  );
}
