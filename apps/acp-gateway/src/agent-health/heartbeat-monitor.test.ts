import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "../agent-registry/registry";
import { AgentMessageRouter } from "../agent-protocol/message-router";
import { HeartbeatMonitor } from "./heartbeat-monitor";
import type { HealthEvent } from "./types";

function createHealthStore() {
  const events: HealthEvent[] = [];
  return {
    events,
    async append(event: HealthEvent) {
      events.push(event);
    }
  };
}

describe("agent-health/heartbeat-monitor", () => {
  let registry: AgentRegistry;
  let router: AgentMessageRouter;
  let monitor: HeartbeatMonitor;
  let store: ReturnType<typeof createHealthStore>;

  beforeEach(async () => {
    registry = new AgentRegistry();
    router = new AgentMessageRouter({ registry });
    store = createHealthStore();

    await registry.register({
      agentId: "agent-a",
      capabilities: ["code-generation"],
      status: "online",
      lastHeartbeat: new Date("2026-04-27T10:00:00.000Z")
    });

    monitor = new HeartbeatMonitor({
      registry,
      router,
      eventStore: store,
      config: {
        intervalMs: 10000,
        timeoutMs: 10000,
        maxMissedHeartbeats: 3
      }
    });
  });

  it("records heartbeats and refreshes the registry timestamp", async () => {
    const heartbeatAt = new Date("2026-04-27T10:00:05.000Z");

    await monitor.recordHeartbeat("agent-a", heartbeatAt);

    expect(registry.getAgent("agent-a")?.lastHeartbeat).toEqual(heartbeatAt);
    expect(store.events.at(-1)?.eventType).toBe("heartbeat_received");
  });

  it("marks agents unhealthy after three missed heartbeats", async () => {
    await monitor.runHealthCheck(new Date("2026-04-27T10:00:35.000Z"));

    expect(monitor.getAgentHealth("agent-a")?.status).toBe("unhealthy");
    expect(registry.getAgent("agent-a")?.status).toBe("unhealthy");
  });

  it("triggers the alert callback on unhealthy transitions", async () => {
    const callback = vi.fn();
    monitor.setAlertCallback(callback);

    await monitor.runHealthCheck(new Date("2026-04-27T10:00:35.000Z"));

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "status_changed",
        newStatus: "unhealthy"
      })
    );
  });

  it("supports active probes via the message router", async () => {
    const result = await monitor.activeProbe("agent-a");

    expect(result.ok).toBe(true);
    expect(result.status).toBe("healthy");
  });
});
