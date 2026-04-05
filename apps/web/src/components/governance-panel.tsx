import type { TaskRecord } from "@feudal/contracts";

interface GovernancePanelProps {
  task: TaskRecord;
}

export function GovernancePanel({ task }: GovernancePanelProps) {
  if (!task.governance) {
    return null;
  }

  return (
    <article>
      <h3>Governance</h3>
      <ul className="detail-list governance-list">
        <li>
          <strong>Sensitivity</strong>
          <span>{task.governance.sensitivity}</span>
        </li>
        <li>
          <strong>Approval</strong>
          <span>
            {task.governance.requestedRequiresApproval ? "requested" : "not requested"} /{" "}
            {task.governance.effectiveRequiresApproval ? "effective" : "skipped"}
          </span>
        </li>
        <li>
          <strong>Execution Mode</strong>
          <span>{task.governance.executionMode}</span>
        </li>
        <li>
          <strong>Review Verdict</strong>
          <span>{task.governance.reviewVerdict}</span>
        </li>
        <li>
          <strong>Revision Count</strong>
          <span>{task.governance.revisionCount}</span>
        </li>
      </ul>
      {task.governance.policyReasons.length > 0 ? (
        <ul className="detail-list">
          {task.governance.policyReasons.map((reason) => (
            <li key={reason}>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
