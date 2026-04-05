import type { TaskRecord } from "@feudal/contracts";

interface ApprovalInboxPanelProps {
  activeTaskId?: string;
  onApprove: (taskId: string) => void | Promise<void>;
  onReject: (taskId: string) => void | Promise<void>;
  tasks: TaskRecord[];
}

export function ApprovalInboxPanel(props: ApprovalInboxPanelProps) {
  const { activeTaskId, onApprove, onReject, tasks } = props;

  return (
    <section className="panel panel-approval">
      <div className="panel-header">
        <h2>Governance Inbox</h2>
        <span>{tasks.length} waiting</span>
      </div>

      <ul className="detail-list">
        {tasks.map((task) => {
          const canApprove = task.governance
            ? task.governance.allowedActions.includes("approve")
            : task.status === "awaiting_approval";
          const canReject = task.governance
            ? task.governance.allowedActions.includes("reject")
            : task.status === "awaiting_approval";

          return (
            <li key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.status}</span>
                {task.status === "needs_revision" ? (
                  <small>Open Task Detail to submit a revision note.</small>
                ) : null}
                {task.approvalRequest ? (
                  <>
                    <small>{`Prompt: ${task.approvalRequest.prompt}`}</small>
                    <small>{task.approvalRequest.actions.join(" / ")}</small>
                  </>
                ) : null}
              </div>
              <div className="button-row">
                {canApprove ? (
                  <button
                    type="button"
                    disabled={activeTaskId === task.id}
                    onClick={() => void onApprove(task.id)}
                  >
                    {activeTaskId === task.id
                      ? `Processing ${task.title}...`
                      : `Approve ${task.title}`}
                  </button>
                ) : null}
                {canReject ? (
                  <button
                    type="button"
                    disabled={activeTaskId === task.id}
                    onClick={() => void onReject(task.id)}
                  >
                    {activeTaskId === task.id
                      ? `Processing ${task.title}...`
                      : `Reject ${task.title}`}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
