import type { ACPArtifact, ACPMessage, ACPRunStatus } from "@feudal/acp";
import { manifests } from "./manifests";

export interface GatewayRunRecord {
  id: string;
  agent: string;
  status: ACPRunStatus;
  messages: ACPMessage[];
  artifacts: ACPArtifact[];
  awaitPrompt?: string;
  allowedActions?: string[];
}

export class GatewayStore {
  private readonly runs = new Map<string, GatewayRunRecord>();

  listAgents() {
    return manifests;
  }

  saveRun(run: GatewayRunRecord): GatewayRunRecord {
    this.runs.set(run.id, run);
    return run;
  }

  getRun(runId: string): GatewayRunRecord | undefined {
    return this.runs.get(runId);
  }
}
