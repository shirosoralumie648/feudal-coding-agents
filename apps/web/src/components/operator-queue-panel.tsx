import type { OperatorActionSummary } from "@feudal/contracts";

interface OperatorQueuePanelProps {
  activeTaskId?: string;
  disabled?: boolean;
  summary: OperatorActionSummary;
  onSelectTask: (taskId: string) => void;
}

export function OperatorQueuePanel(props: OperatorQueuePanelProps) {
  const { activeTaskId, disabled = false, onSelectTask, summary } = props;

  return (
    <section className="panel panel-operator-queue">
      <div className="panel-header">
        <h2>Operator Queue</h2>
        <span>{summary.tasksNeedingOperatorAttention} waiting</span>
      </div>

      <ul className="detail-list">
        {summary.tasks.map((task) => (
          <li key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.recoveryReason ?? task.status}</span>
              <small>{task.operatorAllowedActions.join(" / ")}</small>
            </div>
            <button
              type="button"
              disabled={disabled || activeTaskId === task.id}
              onClick={() => onSelectTask(task.id)}
            >
              Open task
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
