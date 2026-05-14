import type { OperatorActionRecord } from "@feudal/contracts";
import type { TaskConsoleRecord } from "../lib/api";

interface OperatorConsolePanelProps {
  task: TaskConsoleRecord;
  actions: OperatorActionRecord[];
  error?: string;
  note: string;
  isSubmitting: boolean;
  onNoteChange: (value: string) => void;
  onRecover: () => void | Promise<void>;
  onTakeover: () => void | Promise<void>;
  onAbandon: () => void | Promise<void>;
}

export function OperatorConsolePanel(props: OperatorConsolePanelProps) {
  const {
    task,
    actions,
    error,
    note,
    isSubmitting,
    onNoteChange,
    onRecover,
    onTakeover,
    onAbandon
  } = props;

  const hasAllowedActions = (task.operatorAllowedActions?.length ?? 0) > 0;
  const hasHistory = actions.length > 0;
  const canSubmit = note.trim().length > 0 && !isSubmitting;

  if (!hasAllowedActions && !hasHistory) {
    return null;
  }

  return (
    <article className="operator-console-panel">
      <h3>Operator Console</h3>
      <p>
        {task.recoveryReason ??
          (hasAllowedActions
            ? "This task allows direct operator intervention."
            : "No operator actions are currently available for this task.")}
      </p>
      {hasAllowedActions ? (
        <>
          {error ? <p className="field-note">{error}</p> : null}
          <label>
            Operator note
            <textarea
              aria-label="Operator note"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
          <div className="button-row">
            {task.operatorAllowedActions.includes("recover") ? (
              <button type="button" disabled={!canSubmit} onClick={() => void onRecover()}>
                Recover task
              </button>
            ) : null}
            {task.operatorAllowedActions.includes("takeover") ? (
              <button type="button" disabled={!canSubmit} onClick={() => void onTakeover()}>
                Take over task
              </button>
            ) : null}
            {task.operatorAllowedActions.includes("abandon") ? (
              <button type="button" disabled={!canSubmit} onClick={() => void onAbandon()}>
                Abandon task
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {hasHistory ? (
        <ul className="operator-history">
          {actions.map((action) => (
            <li key={action.id}>
              <strong>{`${action.actionType} / ${action.status}`}</strong>
              <span>{action.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
