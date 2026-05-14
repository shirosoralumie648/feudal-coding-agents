import { deriveWorkflowPhase, type WorkflowPhase } from "@feudal/contracts";
import type { TaskConsoleRecord } from "./api";

export const workflowPhaseLabels: Record<WorkflowPhase, string> = {
  intake: "Intake",
  planning: "Planning",
  review: "Review",
  approval: "Approval",
  execution: "Execution",
  verification: "Verification",
  revision: "Revision",
  recovery: "Recovery",
  completed: "Completed",
  terminal: "Terminal"
};

const nextWorkflowPhaseMap: Partial<Record<WorkflowPhase, WorkflowPhase>> = {
  intake: "planning",
  planning: "review",
  review: "approval",
  approval: "execution",
  execution: "verification",
  verification: "completed",
  revision: "planning",
  recovery: "execution"
};

export function getTaskWorkflowPhase(task: Pick<TaskConsoleRecord, "status" | "workflowPhase" | "recoveryState">): WorkflowPhase {
  return (
    task.workflowPhase ??
    deriveWorkflowPhase({
      status: task.status,
      recoveryState: task.recoveryState
    })
  );
}

export function getTaskWorkflowPhaseLabel(
  task: Pick<TaskConsoleRecord, "status" | "workflowPhase" | "recoveryState">
) {
  return workflowPhaseLabels[getTaskWorkflowPhase(task)];
}

export function getNextWorkflowPhaseLabel(
  task: Pick<TaskConsoleRecord, "status" | "workflowPhase" | "recoveryState">
) {
  const nextPhase = nextWorkflowPhaseMap[getTaskWorkflowPhase(task)];

  return nextPhase ? workflowPhaseLabels[nextPhase] : undefined;
}
