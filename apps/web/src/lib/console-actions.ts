import type { OperatorActionType } from "@feudal/contracts";
import {
  abandonTask,
  createTask,
  recoverTask,
  submitGovernanceAction,
  takeoverTask,
  type CreateTaskInput
} from "./api";

export async function submitTaskDraft(input: CreateTaskInput) {
  return createTask({
    ...input,
    title: input.title.trim(),
    prompt: input.prompt.trim()
  });
}

export async function runGovernanceAction(
  taskId: string,
  action: "approve" | "reject" | "revise",
  note?: string
) {
  return submitGovernanceAction(taskId, action, note);
}

export async function runOperatorAction(
  taskId: string,
  action: OperatorActionType,
  note: string
) {
  if (action === "recover") {
    return recoverTask(taskId, note);
  }

  if (action === "takeover") {
    return takeoverTask(taskId, note);
  }

  return abandonTask(taskId, note);
}
