/**
 * Agent Registry - Registration and lifecycle management
 *
 * Manages agent registration, deregistration, and lifecycle events.
 * Supports both persistent agents (stored in event store) and temporary
 * agents (in-memory only, auto-deregister after use).
 */

import { randomUUID } from "node:crypto";
import type { AgentManifest, AgentHealthStatus, AgentRegistryEvent } from "./types";
import { validateManifest } from "./types";

// ── Types ──────────────────────────────────────────────

export interface AgentRegistryStore {
  append(event: AgentRegistryEvent): Promise<void>;
  loadEvents(): Promise<AgentRegistryEvent[]>;
}

export interface RegistrationOptions {
  /** If true, agent is stored in memory only without event persistence */
  temporary?: boolean;
}

export interface RegistrationResult {
  success: true;
  agentId: string;
  version: number;
}

export interface RegistrationError {
  success: false;
  error: string;
}

export type RegisterResult = RegistrationResult | RegistrationError;

interface InternalAgentRecord extends AgentManifest {
  version: number;
  temporary: boolean;
}

type ChangeCallback = () => void;

// ── Implementation ──────────────────────────────────────

export class AgentRegistry {
  private readonly agents = new Map<string, InternalAgentRecord>();
  private readonly store: AgentRegistryStore | undefined;
  private readonly changeCallbacks = new Set<ChangeCallback>();

  constructor(options?: { store?: AgentRegistryStore }) {
    this.store = options?.store;
  }

  /**
   * Subscribe to registry changes. Returns unsubscribe function.
   */
  onChange(callback: ChangeCallback): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  private notifyChange(): void {
    for (const callback of this.changeCallbacks) {
      callback();
    }
  }

  async register(manifest: Partial<AgentManifest> & Omit<AgentManifest, "agentId">, options?: RegistrationOptions): Promise<RegisterResult> {
    // Generate agentId if not provided
    const agentId = manifest.agentId ?? `agent-${randomUUID().slice(0, 8)}`;
    const fullManifest: AgentManifest = { ...manifest, agentId };

    const validation = validateManifest(fullManifest);
    if (!validation.valid) {
      return { success: false, error: `Validation failed: ${validation.errors.map((e) => e.message).join(", ")}` };
    }

    if (this.agents.has(agentId)) {
      return { success: false, error: `Agent "${agentId}" is already registered` };
    }

    const isTemporary = options?.temporary ?? false;
    const record: InternalAgentRecord = {
      ...fullManifest,
      version: 1,
      temporary: isTemporary,
    };

    this.agents.set(agentId, record);

    if (!isTemporary && this.store) {
      await this.store.append({
        type: "agent.registered",
        agentId,
        timestamp: new Date().toISOString(),
      });
    }

    this.notifyChange();

    return { success: true, agentId, version: 1 };
  }

  async unregister(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    this.agents.delete(agentId);

    if (!agent.temporary && this.store) {
      await this.store.append({
        type: "agent.deregistered",
        agentId,
        timestamp: new Date().toISOString(),
      });
    }

    this.notifyChange();
  }

  async updateHealth(agentId: string, health: AgentHealthStatus): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    agent.health = health;

    if (!agent.temporary && this.store) {
      await this.store.append({
        type: "agent.health-changed",
        agentId,
        health,
        timestamp: new Date().toISOString(),
      });
    }

    this.notifyChange();
  }

  getAgent(agentId: string): AgentManifest | undefined {
    const record = this.agents.get(agentId);
    if (!record) return undefined;

    // Return without internal fields
    const { version, temporary, ...manifest } = record;
    return manifest;
  }

  listAgents(): AgentManifest[] {
    return Array.from(this.agents.values()).map((record) => {
      const { version, temporary, ...manifest } = record;
      return manifest;
    });
  }

  getAgentVersion(agentId: string): number | undefined {
    return this.agents.get(agentId)?.version;
  }

  async restore(): Promise<void> {
    if (!this.store) return;

    this.agents.clear();

    const events = await this.store.loadEvents();

    for (const event of events) {
      if (event.type === "agent.registered") {
        // We need the full manifest for restore - this is a simplified version
        // In a real implementation, we'd store the full manifest in the event
        // For now, create a placeholder that will be updated
        this.agents.set(event.agentId, {
          agentId: event.agentId,
          name: "Restored Agent",
          version: "0.0.0",
          description: "Restored from event store",
          capabilities: [],
          inputSchema: {},
          outputSchema: {},
          runtimeHints: {},
          health: "healthy",
          registeredAt: event.timestamp,
          temporary: false,
        });
      } else if (event.type === "agent.deregistered") {
        this.agents.delete(event.agentId);
      } else if (event.type === "agent.health-changed") {
        const agent = this.agents.get(event.agentId);
        if (agent) {
          agent.health = event.health;
        }
      }
    }
  }
}
