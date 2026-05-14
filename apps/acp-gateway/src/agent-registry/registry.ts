import { randomUUID } from "node:crypto";
import {
  AgentRegistrationSchema,
  AgentRegistrationInputSchema,
  type AgentMetadata,
  type AgentRegistration,
  type AgentRegistrationInput,
  type AgentStatus
} from "./types";

export type AgentRegistryEvent =
  | {
      type: "agent.registered";
      agentId: string;
      registration: AgentRegistration;
      timestamp: string;
    }
  | {
      type: "agent.unregistered";
      agentId: string;
      timestamp: string;
    }
  | {
      type: "agent.status-changed";
      agentId: string;
      status: AgentStatus;
      version: number;
      timestamp: string;
    };

export interface AgentRegistryEventStore {
  append(event: AgentRegistryEvent): Promise<void>;
  loadEvents(): Promise<AgentRegistryEvent[]>;
}

export interface RegistrationOptions {
  temporary?: boolean;
}

export interface RegistrationSuccess {
  success: true;
  agentId: string;
  registrationId: string;
  version: number;
}

export interface RegistrationError {
  success: false;
  error: string;
}

export type RegisterResult = RegistrationSuccess | RegistrationError;

type ChangeCallback = () => void;

function registrationToMetadata(registration: AgentRegistration): AgentMetadata {
  const { registrationId: _registrationId, version: _version, ...metadata } = registration;
  return metadata;
}

export class AgentRegistry {
  private readonly persistentAgents = new Map<string, AgentRegistration>();
  private readonly temporaryAgents = new Map<string, AgentRegistration>();
  private readonly store: AgentRegistryEventStore | undefined;
  private readonly changeCallbacks = new Set<ChangeCallback>();

  constructor(options?: { store?: AgentRegistryEventStore }) {
    this.store = options?.store;
  }

  onChange(callback: ChangeCallback): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  private notifyChange(): void {
    for (const callback of this.changeCallbacks) {
      callback();
    }
  }

  private getRegistration(agentId: string): AgentRegistration | undefined {
    return this.persistentAgents.get(agentId) ?? this.temporaryAgents.get(agentId);
  }

  async register(
    input: AgentRegistrationInput,
    options?: RegistrationOptions
  ): Promise<RegisterResult> {
    const parsed = AgentRegistrationInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.issues
          .map((issue) => issue.message)
          .join(", ")}`
      };
    }

    const now = new Date();
    const agentId = parsed.data.agentId ?? `agent-${randomUUID().slice(0, 8)}`;
    if (this.getRegistration(agentId)) {
      return {
        success: false,
        error: `Agent "${agentId}" is already registered`
      };
    }

    const isTemporary = options?.temporary ?? parsed.data.isTemporary ?? false;
    const registration = AgentRegistrationSchema.parse({
      agentId,
      capabilities: parsed.data.capabilities,
      status: parsed.data.status ?? "online",
      lastHeartbeat: parsed.data.lastHeartbeat ?? now,
      metadata: parsed.data.metadata ?? {},
      registeredAt: parsed.data.registeredAt ?? now,
      isTemporary,
      registrationId: randomUUID(),
      version: 1
    });

    const target = isTemporary ? this.temporaryAgents : this.persistentAgents;
    target.set(agentId, registration);

    if (!isTemporary && this.store) {
      await this.store.append({
        type: "agent.registered",
        agentId,
        registration,
        timestamp: now.toISOString()
      });
    }

    this.notifyChange();

    return {
      success: true,
      agentId,
      registrationId: registration.registrationId,
      version: registration.version
    };
  }

  async unregister(agentId: string): Promise<void> {
    const persistent = this.persistentAgents.get(agentId);
    const temporary = this.temporaryAgents.get(agentId);
    const registration = persistent ?? temporary;

    if (!registration) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    this.persistentAgents.delete(agentId);
    this.temporaryAgents.delete(agentId);

    if (!registration.isTemporary && this.store) {
      await this.store.append({
        type: "agent.unregistered",
        agentId,
        timestamp: new Date().toISOString()
      });
    }

    this.notifyChange();
  }

  async updateHeartbeat(agentId: string, timestamp = new Date()): Promise<void> {
    const registration = this.getRegistration(agentId);
    if (!registration) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    registration.lastHeartbeat = timestamp;
    registration.version += 1;
    this.notifyChange();
  }

  async setStatus(agentId: string, status: AgentStatus): Promise<void> {
    const registration = this.getRegistration(agentId);
    if (!registration) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    registration.status = status;
    registration.version += 1;

    if (!registration.isTemporary && this.store) {
      await this.store.append({
        type: "agent.status-changed",
        agentId,
        status,
        version: registration.version,
        timestamp: new Date().toISOString()
      });
    }

    this.notifyChange();
  }

  getAgent(agentId: string): AgentMetadata | undefined {
    const registration = this.getRegistration(agentId);
    return registration ? registrationToMetadata(registration) : undefined;
  }

  listAgents(): AgentMetadata[] {
    return [...this.persistentAgents.values(), ...this.temporaryAgents.values()].map(
      registrationToMetadata
    );
  }

  async restore(): Promise<void> {
    if (!this.store) {
      return;
    }

    this.persistentAgents.clear();

    for (const event of await this.store.loadEvents()) {
      switch (event.type) {
        case "agent.registered":
          this.persistentAgents.set(
            event.agentId,
            AgentRegistrationSchema.parse(event.registration)
          );
          break;
        case "agent.status-changed": {
          const registration = this.persistentAgents.get(event.agentId);
          if (!registration) {
            break;
          }
          registration.status = event.status;
          registration.version = Math.max(registration.version, event.version);
          break;
        }
        case "agent.unregistered":
          this.persistentAgents.delete(event.agentId);
          break;
      }
    }

    this.notifyChange();
  }
}
