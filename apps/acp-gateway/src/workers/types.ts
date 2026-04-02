import type { ACPMessage } from "@feudal/acp";

export const gatewayWorkerNames = [
  "intake-agent",
  "analyst-agent",
  "auditor-agent",
  "critic-agent",
  "gongbu-executor",
  "xingbu-verifier"
] as const;

export type GatewayWorkerName = (typeof gatewayWorkerNames)[number];

export interface CodexRunner {
  run(input: {
    role: GatewayWorkerName;
    prompt: string;
    schema: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

export interface WorkerDefinition {
  artifactName: string;
  outputSchema: Record<string, unknown>;
  buildPrompt(messages: ACPMessage[]): string;
  parseOutput(payload: unknown): Record<string, unknown>;
}
