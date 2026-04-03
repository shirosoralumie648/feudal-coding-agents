import type { TaskRecord } from "@feudal/contracts";

interface ApprovalInboxPanelProps {
  activeApprovalId?: string;
  onApprove: (taskId: string) => void | Promise<void>;
  tasks: TaskRecord[];
}

export function ApprovalInboxPanel(props: ApprovalInboxPanelProps) {
  const { activeApprovalId, onApprove, tasks } = props;

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
            <button
              type="button"
              disabled={activeApprovalId === task.id}
              onClick={() => void onApprove(task.id)}
            >
              {activeApprovalId === task.id
                ? `Approving ${task.title}...`
                : `Approve ${task.title}`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
