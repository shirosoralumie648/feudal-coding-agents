import type {
  ACPAgentManifest,
  ACPArtifact,
  ACPMessage,
  ACPRunStatus
} from "@feudal/acp";
import { manifests } from "./manifests";
import {
  buildRunEventInputs,
  toGatewayRunProjectionRecord
} from "./persistence/run-event-codec";

export type GatewayRecoveryState = "healthy" | "replaying" | "recovery_required";

export interface GatewayRunRecord {
  id: string;
  agent: string;
  status: ACPRunStatus;
  phase?: string;
  messages: ACPMessage[];
  artifacts: ACPArtifact[];
  awaitPrompt?: string;
  allowedActions?: string[];
}

export interface GatewayRunProjectionRecord extends GatewayRunRecord {
  recoveryState: GatewayRecoveryState;
  recoveryReason?: string;
  lastRecoveredAt?: string;
  latestEventId: number;
  latestProjectionVersion: number;
}

interface GatewayRunEventRecord {
  id: number;
  streamType: "run";
  streamId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  payloadJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
}

function toEventVersionMismatchError(runId: string) {
  return new Error(`Event version mismatch for run:${runId}`);
}

export interface GatewayRunStore {
  getRun(runId: string): Promise<GatewayRunProjectionRecord | undefined>;
  saveRun(
    run: GatewayRunRecord,
    eventType: string,
    expectedVersion: number
  ): Promise<GatewayRunProjectionRecord>;
}

export class GatewayStore implements GatewayRunStore {
  private readonly runs = new Map<string, GatewayRunProjectionRecord>();
  private readonly events = new Map<string, GatewayRunEventRecord[]>();
  private nextEventId = 1;

  listAgents(): ACPAgentManifest[] {
    return manifests;
  }

  async saveRun(run: GatewayRunRecord, eventType: string, expectedVersion: number) {
    const existingEvents = this.events.get(run.id) ?? [];
    const currentVersion = existingEvents.at(-1)?.eventVersion ?? 0;
    const previousRun = this.runs.get(run.id);

    if (currentVersion !== expectedVersion) {
      throw toEventVersionMismatchError(run.id);
    }

    const occurredAt = new Date().toISOString();
    const appendedEvents = buildRunEventInputs(run, eventType, previousRun).map(
      (event, offset) => ({
        id: this.nextEventId++,
        streamType: "run" as const,
        streamId: run.id,
        eventType: event.eventType,
        eventVersion: expectedVersion + offset + 1,
        occurredAt,
        payloadJson: event.payloadJson,
        metadataJson: event.metadataJson
      })
    );
    const latestEvent = appendedEvents.at(-1);
    const projection = toGatewayRunProjectionRecord({
      run,
      latestEventId: latestEvent?.id ?? 0,
      latestProjectionVersion: latestEvent?.eventVersion ?? expectedVersion,
      lastRecoveredAt: occurredAt
    });

    this.events.set(run.id, [...existingEvents, ...appendedEvents]);
    this.runs.set(run.id, projection);

    return projection;
  }

  async getRun(runId: string) {
    return this.runs.get(runId);
  }
}
