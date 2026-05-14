import { createJsonRpcRequest } from "../agent-protocol/json-rpc";
import type { AgentMessageRouter } from "../agent-protocol/message-router";
import type { AgentRegistry } from "../agent-registry/registry";
import {
  HealthEventSchema,
  HeartbeatConfigSchema,
  type AgentHealthSummary,
  type AgentHealthStatus,
  type HealthCheckResult,
  type HealthEvent,
  type HeartbeatConfig
} from "./types";

export interface HealthEventStore {
  append(event: HealthEvent): Promise<void>;
}

type EventListener = (event: HealthEvent) => void;

interface HealthState {
  status: AgentHealthStatus;
  missedHeartbeats: number;
  lastHeartbeat?: Date;
}

function deriveMissedHeartbeats(
  lastHeartbeat: Date | undefined,
  now: Date,
  config: HeartbeatConfig
): number {
  if (!lastHeartbeat) {
    return config.maxMissedHeartbeats;
  }

  const elapsed = now.getTime() - lastHeartbeat.getTime();
  if (elapsed <= config.timeoutMs) {
    return 0;
  }

  return Math.floor((elapsed - config.timeoutMs) / config.intervalMs) + 1;
}

function deriveHealthStatus(
  missedHeartbeats: number,
  config: HeartbeatConfig
): AgentHealthStatus {
  if (missedHeartbeats <= 0) {
    return "healthy";
  }

  if (missedHeartbeats >= config.maxMissedHeartbeats) {
    return "unhealthy";
  }

  return "degraded";
}

export class HeartbeatMonitor {
  private readonly config: HeartbeatConfig;
  private readonly eventStore: HealthEventStore | undefined;
  private readonly listeners = new Set<EventListener>();
  private readonly states = new Map<string, HealthState>();
  private readonly recentEvents: HealthEvent[] = [];
  private alertCallback: ((event: HealthEvent) => void) | undefined;
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly options: {
      registry: AgentRegistry;
      router?: AgentMessageRouter;
      eventStore?: HealthEventStore;
      config: HeartbeatConfig;
    }
  ) {
    this.config = HeartbeatConfigSchema.parse(options.config);
    this.eventStore = options.eventStore;
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setAlertCallback(callback: (event: HealthEvent) => void): void {
    this.alertCallback = callback;
  }

  async recordHeartbeat(agentId: string, timestamp = new Date()): Promise<void> {
    await this.options.registry.updateHeartbeat(agentId, timestamp);

    const previous = this.states.get(agentId);
    this.states.set(agentId, {
      status: "healthy",
      missedHeartbeats: 0,
      lastHeartbeat: timestamp
    });

    await this.emit({
      eventType: "heartbeat_received",
      agentId,
      timestamp,
      previousStatus: previous?.status,
      newStatus: "healthy",
      metadata: { missedHeartbeats: 0 }
    });

    if (this.options.registry.getAgent(agentId)?.status === "unhealthy") {
      await this.options.registry.setStatus(agentId, "online");
    }
  }

  startMonitoring(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.runHealthCheck(new Date());
    }, this.config.intervalMs);
  }

  stopMonitoring(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  async runHealthCheck(now = new Date()): Promise<void> {
    for (const agent of this.options.registry.listAgents()) {
      const missedHeartbeats = deriveMissedHeartbeats(
        agent.lastHeartbeat,
        now,
        this.config
      );
      const status = deriveHealthStatus(missedHeartbeats, this.config);
      const previous = this.states.get(agent.agentId);

      this.states.set(agent.agentId, {
        status,
        missedHeartbeats,
        lastHeartbeat: agent.lastHeartbeat
      });

      if (missedHeartbeats > 0) {
        await this.emit({
          eventType: "heartbeat_missed",
          agentId: agent.agentId,
          timestamp: now,
          previousStatus: previous?.status,
          newStatus: status,
          metadata: { missedHeartbeats }
        });
      }

      if (previous?.status !== status) {
        if (status === "unhealthy") {
          await this.options.registry.setStatus(agent.agentId, "unhealthy");
        } else if (agent.status === "unhealthy") {
          await this.options.registry.setStatus(agent.agentId, "online");
        }

        await this.emit({
          eventType: "status_changed",
          agentId: agent.agentId,
          timestamp: now,
          previousStatus: previous?.status ?? "unknown",
          newStatus: status,
          metadata: { missedHeartbeats }
        });
      }
    }
  }

  async activeProbe(agentId: string): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    const agent = this.options.registry.getAgent(agentId);

    if (!agent) {
      return {
        agentId,
        status: "unknown",
        missedHeartbeats: 0,
        ok: false
      };
    }

    await this.emit({
      eventType: "active_probe_sent",
      agentId,
      timestamp: new Date(startedAt)
    });

    if (!this.options.router) {
      await this.emit({
        eventType: "active_probe_failed",
        agentId,
        timestamp: new Date(),
        metadata: { reason: "Router not configured" }
      });

      return {
        agentId,
        status: "unknown",
        missedHeartbeats: this.getAgentHealth(agentId)?.missedCount ?? 0,
        lastHeartbeat: agent.lastHeartbeat,
        ok: false
      };
    }

    const result = await this.options.router.send(
      createJsonRpcRequest({
        method: "agent.ping",
        params: {},
        from: "heartbeat-monitor",
        to: agentId
      })
    );

    const responseTimeMs = Date.now() - startedAt;
    if (!result.delivered) {
      await this.emit({
        eventType: "active_probe_failed",
        agentId,
        timestamp: new Date(),
        metadata: { responseTimeMs }
      });

      return {
        agentId,
        status: "unhealthy",
        missedHeartbeats: this.getAgentHealth(agentId)?.missedCount ?? 0,
        lastHeartbeat: agent.lastHeartbeat,
        ok: false,
        responseTimeMs
      };
    }

    return {
      agentId,
      status: "healthy",
      missedHeartbeats: this.getAgentHealth(agentId)?.missedCount ?? 0,
      lastHeartbeat: agent.lastHeartbeat,
      ok: true,
      responseTimeMs
    };
  }

  getAgentHealth(agentId: string): AgentHealthSummary | undefined {
    const state = this.states.get(agentId);
    const agent = this.options.registry.getAgent(agentId);

    if (!agent && !state) {
      return undefined;
    }

    return {
      agentId,
      status: state?.status ?? "unknown",
      lastHeartbeat: state?.lastHeartbeat ?? agent?.lastHeartbeat,
      missedCount: state?.missedHeartbeats ?? 0
    };
  }

  getAllAgentHealth(): AgentHealthSummary[] {
    return this.options.registry.listAgents().map((agent) => ({
      agentId: agent.agentId,
      status: this.states.get(agent.agentId)?.status ?? "unknown",
      lastHeartbeat: this.states.get(agent.agentId)?.lastHeartbeat ?? agent.lastHeartbeat,
      missedCount: this.states.get(agent.agentId)?.missedHeartbeats ?? 0
    }));
  }

  getEvents(filter?: { agentId?: string; since?: Date }): HealthEvent[] {
    return this.recentEvents.filter((event) => {
      if (filter?.agentId && event.agentId !== filter.agentId) {
        return false;
      }

      if (filter?.since && event.timestamp < filter.since) {
        return false;
      }

      return true;
    });
  }

  private async emit(event: HealthEvent): Promise<void> {
    const parsed = HealthEventSchema.parse(event);
    this.recentEvents.push(parsed);
    await this.eventStore?.append(parsed);

    for (const listener of this.listeners) {
      listener(parsed);
    }

    if (parsed.eventType === "status_changed" && parsed.newStatus === "unhealthy") {
      this.alertCallback?.(parsed);
    }
  }
}
