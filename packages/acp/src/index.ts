export type ACPRole = "user" | `agent/${string}`;

export interface ACPMessage {
  role: ACPRole;
  content: string;
}

export interface ACPArtifact {
  id: string;
  name: string;
  mimeType: string;
  content: unknown;
}

export interface ACPAgentManifest {
  name: string;
  role: string;
  description: string;
  capabilities: string[];
}

export type ACPRunStatus = "running" | "awaiting" | "completed" | "failed";

export interface ACPRun {
  id: string;
  agent: string;
  status: ACPRunStatus;
  messages: ACPMessage[];
  artifacts: ACPArtifact[];
  awaitPrompt?: string;
  allowedActions?: string[];
}

export interface ACPClient {
  listAgents(): Promise<ACPAgentManifest[]>;
  runAgent(input: {
    agent: string;
    messages: ACPMessage[];
    metadata?: Record<string, unknown>;
  }): Promise<ACPRun>;
  awaitExternalInput(input: {
    label: string;
    prompt: string;
    actions: string[];
  }): Promise<ACPRun>;
  respondToAwait(runId: string, response: ACPMessage): Promise<ACPRun>;
  getRun(runId: string): Promise<ACPRun | undefined>;
}
