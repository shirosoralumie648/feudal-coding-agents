import type { TaskRecord, TaskStatus } from "@feudal/contracts";

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
  selectedTask: TaskRecord | null;
}

export function TaskDetailPanel(props: TaskDetailPanelProps) {
  const { laneLabels, selectedTask } = props;

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
