import type { TaskRecord } from "@feudal/contracts";

interface ApprovalInboxPanelProps {
  activeApprovalId?: string;
  onApprove: (taskId: string) => void | Promise<void>;
  onReject: (taskId: string) => void | Promise<void>;
  tasks: TaskRecord[];
}

export function ApprovalInboxPanel(props: ApprovalInboxPanelProps) {
  const { activeApprovalId, onApprove, onReject, tasks } = props;

  return (
    <section className="panel panel-approval">
      <div className="panel-header">
        <h2>Approval Inbox</h2>
        <span>{tasks.length} waiting</span>
      </div>

      <ul className="detail-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.status}</span>
              {task.approvalRequest ? (
                <>
                  <small>{`Prompt: ${task.approvalRequest.prompt}`}</small>
                  <small>{task.approvalRequest.actions.join(" / ")}</small>
                </>
              ) : null}
            </div>
            <div className="button-row">
              <button
                type="button"
                disabled={activeApprovalId === task.id}
                onClick={() => void onApprove(task.id)}
              >
                {activeApprovalId === task.id
                  ? `Processing ${task.title}...`
                  : `Approve ${task.title}`}
              </button>
              <button
                type="button"
                disabled={activeApprovalId === task.id}
                onClick={() => void onReject(task.id)}
              >
                {activeApprovalId === task.id
                  ? `Processing ${task.title}...`
                  : `Reject ${task.title}`}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
