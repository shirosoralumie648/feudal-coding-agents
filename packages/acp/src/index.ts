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

export type ACPRunStatus =
  | "created"
  | "in-progress"
  | "awaiting"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

export type ACPRunPhase =
  | "intake"
  | "planning"
  | "review"
  | "approval"
  | "execution"
  | "verification";

export interface ACPRun {
  id: string;
  agent: string;
  status: ACPRunStatus;
  phase?: ACPRunPhase;
  messages: ACPMessage[];
  artifacts: ACPArtifact[];
  awaitPrompt?: string;
  allowedActions?: string[];
}

export interface ACPRunAgentInput {
  agent: string;
  messages: ACPMessage[];
  metadata?: Record<string, unknown>;
}

export interface ACPAwaitExternalInput {
  label: string;
  prompt: string;
  actions: string[];
}

export interface ACPClient {
  listAgents(): Promise<ACPAgentManifest[]>;
  runAgent(input: ACPRunAgentInput): Promise<ACPRun>;
  awaitExternalInput(input: ACPAwaitExternalInput): Promise<ACPRun>;
  respondToAwait(runId: string, response: ACPMessage): Promise<ACPRun>;
  getRun(runId: string): Promise<ACPRun | undefined>;
}
