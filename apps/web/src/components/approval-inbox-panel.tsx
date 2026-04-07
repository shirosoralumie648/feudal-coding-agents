import type { TaskRecord } from "@feudal/contracts";

type InlineGovernanceAction = "approve" | "reject";

interface ApprovalInboxPanelProps {
  activeTaskId?: string;
  onGovernanceAction: (
    taskId: string,
    action: InlineGovernanceAction
  ) => void | Promise<void>;
  tasks: TaskRecord[];
}

function getInlineActions(task: TaskRecord): InlineGovernanceAction[] {
  const governanceActions = task.governance
    ? task.governance.allowedActions
    : task.status === "awaiting_approval"
      ? ["approve", "reject"]
      : [];

  return governanceActions.filter(
    (action): action is InlineGovernanceAction =>
      action === "approve" || action === "reject"
  );
}

function hasGovernanceDrift(
  task: TaskRecord,
  inlineActions: InlineGovernanceAction[]
): boolean {
  if (task.status !== "awaiting_approval" || !task.governance || !task.approvalRequest) {
    return false;
  }

  const approvalRequestActions = task.approvalRequest.actions;

  if (approvalRequestActions.length !== inlineActions.length) {
    return true;
  }

  const inlineActionSet = new Set(inlineActions);
  return approvalRequestActions.some((action) => !inlineActionSet.has(action));
}

export function ApprovalInboxPanel(props: ApprovalInboxPanelProps) {
  const { activeTaskId, onGovernanceAction, tasks } = props;

  return (
    <section className="panel panel-approval">
      <div className="panel-header">
        <h2>Governance Inbox</h2>
        <span>{tasks.length} waiting</span>
      </div>

      <ul className="detail-list">
        {tasks.map((task) => {
          const inlineActions = getInlineActions(task);
          const actionStateDrifted = hasGovernanceDrift(task, inlineActions);

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
                {actionStateDrifted ? (
                  <small>Governance action state is out of sync.</small>
                ) : null}
              </div>
              <div className="button-row">
                {actionStateDrifted
                  ? null
                  : inlineActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={activeTaskId === task.id}
                        onClick={() => void onGovernanceAction(task.id, action)}
                      >
                        {activeTaskId === task.id
                          ? `Processing ${task.title}...`
                          : `${action === "approve" ? "Approve" : "Reject"} ${task.title}`}
                      </button>
                    ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
