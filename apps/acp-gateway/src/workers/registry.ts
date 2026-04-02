import type { ACPMessage } from "@feudal/acp";
import {
  decisionBriefSchema,
  executionReportSchema,
  reviewSchema,
  taskSpecSchema
} from "./json-schemas";
import {
  renderAnalystPrompt,
  renderAuditorPrompt,
  renderCriticPrompt,
  renderExecutorPrompt,
  renderIntakePrompt,
  renderVerifierPrompt
} from "./prompt-templates";
import type { GatewayWorkerName, WorkerDefinition } from "./types";

function lastMessage(messages: ACPMessage[]) {
  return messages.at(-1)?.content ?? "";
}

export const workerRegistry: Record<GatewayWorkerName, WorkerDefinition> = {
  "intake-agent": {
    artifactName: "taskspec.json",
    outputSchema: taskSpecSchema,
    buildPrompt: (messages) => renderIntakePrompt(lastMessage(messages))
  },
  "analyst-agent": {
    artifactName: "decision-brief.json",
    outputSchema: decisionBriefSchema,
    buildPrompt: (messages) => renderAnalystPrompt(lastMessage(messages))
  },
  "auditor-agent": {
    artifactName: "review.json",
    outputSchema: reviewSchema,
    buildPrompt: (messages) => renderAuditorPrompt(lastMessage(messages))
  },
  "critic-agent": {
    artifactName: "review.json",
    outputSchema: reviewSchema,
    buildPrompt: (messages) => renderCriticPrompt(lastMessage(messages))
  },
  "gongbu-executor": {
    artifactName: "execution-report.json",
    outputSchema: executionReportSchema,
    buildPrompt: (messages) => renderExecutorPrompt(lastMessage(messages))
  },
  "xingbu-verifier": {
    artifactName: "execution-report.json",
    outputSchema: executionReportSchema,
    buildPrompt: (messages) => renderVerifierPrompt(lastMessage(messages))
  }
};
