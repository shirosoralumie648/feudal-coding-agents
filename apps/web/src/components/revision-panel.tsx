import type { FormEvent } from "react";
import type { TaskRecord } from "@feudal/contracts";

interface RevisionPanelProps {
  isSubmitting: boolean;
  note: string;
  onNoteChange: (nextValue: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  task: TaskRecord;
}

export function RevisionPanel(props: RevisionPanelProps) {
  const { isSubmitting, note, onNoteChange, onSubmit, task } = props;

  if (!task.governance?.allowedActions.includes("revise")) {
    return null;
  }

  return (
    <article className="revision-panel">
      <h3>Revision Request</h3>
      <p>{task.revisionRequest?.note}</p>
      <ul className="detail-list">
        {(task.revisionRequest?.reviewerReasons ?? []).map((reason) => (
          <li key={reason}>
            <span>{reason}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit}>
        <label>
          Revision note
          <textarea
            aria-label="Revision note"
            rows={4}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </label>
        <button disabled={isSubmitting || note.trim().length === 0} type="submit">
          {isSubmitting ? "Submitting revision..." : "Submit revision"}
        </button>
      </form>
    </article>
  );
}
