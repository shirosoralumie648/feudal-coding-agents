import { beforeEach, describe, expect, it } from "vitest";
import {
  AgentRegistry,
  type AgentRegistryEvent,
  type AgentRegistryEventStore
} from "./registry";

function createMockStore(): AgentRegistryEventStore & { events: AgentRegistryEvent[] } {
  const events: AgentRegistryEvent[] = [];

  return {
    events,
    async append(event: AgentRegistryEvent) {
      events.push(event);
    },
    async loadEvents() {
      return [...events];
    }
  };
}

describe("agent-registry/registry", () => {
  let store: ReturnType<typeof createMockStore>;
  let registry: AgentRegistry;

  beforeEach(() => {
    store = createMockStore();
    registry = new AgentRegistry({ store });
  });

  it("registers persistent agents with generated ids and default status", async () => {
    const result = await registry.register({
      capabilities: ["code-generation"],
      metadata: { pool: "default" }
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const agent = registry.getAgent(result.agentId);
    expect(agent).toEqual(
      expect.objectContaining({
        agentId: result.agentId,
        capabilities: ["code-generation"],
        status: "online",
        metadata: { pool: "default" },
        isTemporary: false
      })
    );
    expect(store.events).toHaveLength(1);
    expect(store.events[0]).toEqual(
      expect.objectContaining({
        type: "agent.registered",
        agentId: result.agentId
      })
    );
  });

  it("stores temporary agents in memory only", async () => {
    const result = await registry.register(
      {
        agentId: "temp-agent",
        capabilities: ["testing"]
      },
      { temporary: true }
    );

    expect(result.success).toBe(true);
    expect(registry.getAgent("temp-agent")?.isTemporary).toBe(true);
    expect(store.events).toHaveLength(0);
  });

  it("rejects duplicate registration ids", async () => {
    await registry.register({
      agentId: "duplicate-agent",
      capabilities: ["code-generation"]
    });

    const result = await registry.register({
      agentId: "duplicate-agent",
      capabilities: ["testing"]
    });

    expect(result).toEqual({
      success: false,
      error: 'Agent "duplicate-agent" is already registered'
    });
  });

  it("updates heartbeat timestamps without persisting high-frequency events", async () => {
    await registry.register({
      agentId: "heartbeat-agent",
      capabilities: ["testing"]
    });

    const updatedHeartbeat = new Date("2026-04-27T10:05:00.000Z");
    await registry.updateHeartbeat("heartbeat-agent", updatedHeartbeat);

    expect(registry.getAgent("heartbeat-agent")?.lastHeartbeat).toEqual(updatedHeartbeat);
    expect(store.events).toHaveLength(1);
  });

  it("changes status and persists status change events", async () => {
    await registry.register({
      agentId: "status-agent",
      capabilities: ["analysis"]
    });

    await registry.setStatus("status-agent", "busy");

    expect(registry.getAgent("status-agent")?.status).toBe("busy");
    expect(store.events.at(-1)).toEqual(
      expect.objectContaining({
        type: "agent.status-changed",
        agentId: "status-agent",
        status: "busy"
      })
    );
  });

  it("unregisters persistent agents and records the event", async () => {
    await registry.register({
      agentId: "remove-agent",
      capabilities: ["review"]
    });

    await registry.unregister("remove-agent");

    expect(registry.getAgent("remove-agent")).toBeUndefined();
    expect(store.events.at(-1)).toEqual(
      expect.objectContaining({
        type: "agent.unregistered",
        agentId: "remove-agent"
      })
    );
  });

  it("lists both persistent and temporary agents", async () => {
    await registry.register({
      agentId: "persistent-agent",
      capabilities: ["review"]
    });
    await registry.register(
      {
        agentId: "temporary-agent",
        capabilities: ["testing"]
      },
      { temporary: true }
    );

    expect(registry.listAgents().map((agent) => agent.agentId).sort()).toEqual([
      "persistent-agent",
      "temporary-agent"
    ]);
  });

  it("restores persistent agents and status changes from the event store", async () => {
    await registry.register({
      agentId: "restore-agent",
      capabilities: ["analysis"],
      metadata: { zone: "primary" }
    });
    await registry.setStatus("restore-agent", "busy");

    const restored = new AgentRegistry({ store });
    await restored.restore();

    expect(restored.getAgent("restore-agent")).toEqual(
      expect.objectContaining({
        agentId: "restore-agent",
        capabilities: ["analysis"],
        metadata: { zone: "primary" },
        status: "busy"
      })
    );
  });
});
