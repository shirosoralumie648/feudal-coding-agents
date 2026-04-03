import type { ChangeEvent, FormEvent } from "react";
import type { CreateTaskInput } from "../lib/api";

interface NewTaskPanelProps {
  canSubmit: boolean;
  draft: CreateTaskInput;
  isSubmitting: boolean;
  onDraftChange: (
    field: "title" | "prompt" | "sensitivity",
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  onRequiresApprovalChange: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export function NewTaskPanel(props: NewTaskPanelProps) {
  const {
    canSubmit,
    draft,
    isSubmitting,
    onDraftChange,
    onRequiresApprovalChange,
    onSubmit
  } = props;

  return (
    <section className="panel panel-form">
      <div className="panel-header">
        <h2>New Task</h2>
        <span>Phase 2 intake</span>
      </div>

      <form className="task-form" onSubmit={onSubmit}>
        <label>
          Title
          <input
            name="title"
            placeholder="Refine ACP execution flow"
            value={draft.title}
            onChange={(event) => onDraftChange("title", event)}
          />
        </label>
        <label>
          Prompt
          <textarea
            name="prompt"
            placeholder="Describe the coding objective, constraints, and desired artifact."
            rows={5}
            value={draft.prompt}
            onChange={(event) => onDraftChange("prompt", event)}
          />
        </label>
        <div className="form-row">
          <label>
            Sensitivity
            <select
              name="sensitivity"
              value={draft.sensitivity}
              onChange={(event) => onDraftChange("sensitivity", event)}
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
              onChange={(event) => onRequiresApprovalChange(event.target.checked)}
            />
            Require approval gate
          </label>
        </div>
        <button disabled={!canSubmit} type="submit">
          {isSubmitting ? "Submitting..." : "Submit task"}
        </button>
      </form>
    </section>
  );
}
