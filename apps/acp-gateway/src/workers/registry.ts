import type { ACPMessage } from "@feudal/acp";
import {
  decisionBriefResultSchema,
  decisionBriefSchema,
  executionReportResultSchema,
  executionReportSchema,
  reviewResultSchema,
  reviewSchema,
  taskSpecResultSchema,
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
    buildPrompt: (messages) => renderIntakePrompt(lastMessage(messages)),
    parseOutput: (payload) => taskSpecResultSchema.parse(payload)
  },
  "analyst-agent": {
    artifactName: "decision-brief.json",
    outputSchema: decisionBriefSchema,
    buildPrompt: (messages) => renderAnalystPrompt(lastMessage(messages)),
    parseOutput: (payload) => decisionBriefResultSchema.parse(payload)
  },
  "auditor-agent": {
    artifactName: "review.json",
    outputSchema: reviewSchema,
    buildPrompt: (messages) => renderAuditorPrompt(lastMessage(messages)),
    parseOutput: (payload) => reviewResultSchema.parse(payload)
  },
  "critic-agent": {
    artifactName: "review.json",
    outputSchema: reviewSchema,
    buildPrompt: (messages) => renderCriticPrompt(lastMessage(messages)),
    parseOutput: (payload) => reviewResultSchema.parse(payload)
  },
  "gongbu-executor": {
    artifactName: "execution-report.json",
    outputSchema: executionReportSchema,
    buildPrompt: (messages) => renderExecutorPrompt(lastMessage(messages)),
    parseOutput: (payload) => executionReportResultSchema.parse(payload)
  },
  "xingbu-verifier": {
    artifactName: "execution-report.json",
    outputSchema: executionReportSchema,
    buildPrompt: (messages) => renderVerifierPrompt(lastMessage(messages)),
    parseOutput: (payload) => executionReportResultSchema.parse(payload)
  }
};
