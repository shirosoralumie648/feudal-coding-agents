import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AgentRegistry,
  type AgentRegistryStore,
  type AgentRegistryEvent,
} from "./registry";
import type { AgentManifest, AgentHealthStatus } from "./types";

function makeValidManifest(overrides?: Partial<AgentManifest>): AgentManifest {
  return {
    agentId: "coder-v1",
    name: "Coder Agent",
    version: "1.0.0",
    description: "Generates code from specifications",
    capabilities: [{ id: "code-generation", name: "Code Generation", description: "Generates source code" }],
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    runtimeHints: { estimatedDurationMs: 5000, concurrent: false, priority: 1 },
    health: "healthy",
    registeredAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockStore(): AgentRegistryStore {
  const events: AgentRegistryEvent[] = [];
  return {
    events,
    async append(event: AgentRegistryEvent) {
      events.push(event);
    },
    async loadEvents() {
      return [...events];
    },
  };
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;
  let store: AgentRegistryStore;

  beforeEach(() => {
    store = createMockStore();
    registry = new AgentRegistry({ store });
  });

  describe("register()", () => {
    it("creates new agent entry with generated ID", async () => {
      const manifest = makeValidManifest();
      delete manifest.agentId;

      const result = await registry.register(manifest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.agentId).toMatch(/^agent-[a-z0-9]+$/);
        expect(result.version).toBe(1);
      }
    });

    it("uses provided agentId if specified", async () => {
      const manifest = makeValidManifest({ agentId: "my-custom-agent" });

      const result = await registry.register(manifest);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.agentId).toBe("my-custom-agent");
      }
    });

    it("rejects duplicate agentId", async () => {
      const manifest = makeValidManifest({ agentId: "duplicate-agent" });
      await registry.register(manifest);

      const result = await registry.register(manifest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already registered");
      }
    });

    it("persists registration event to store", async () => {
      const manifest = makeValidManifest({ agentId: "persisted-agent" });

      await registry.register(manifest);

      expect(store.events.length).toBe(1);
      expect(store.events[0].type).toBe("agent.registered");
      expect(store.events[0].agentId).toBe("persisted-agent");
    });

    it("stores temporary agents in memory only (no persistence)", async () => {
      const manifest = makeValidManifest({ agentId: "temp-agent" });

      await registry.register(manifest, { temporary: true });

      expect(store.events.length).toBe(0);
      const agent = registry.getAgent("temp-agent");
      expect(agent).toBeDefined();
    });
  });

  describe("unregister()", () => {
    it("removes agent from registry", async () => {
      const manifest = makeValidManifest({ agentId: "to-remove" });
      await registry.register(manifest);

      await registry.unregister("to-remove");

      const agent = registry.getAgent("to-remove");
      expect(agent).toBeUndefined();
    });

    it("persists deregistration event to store", async () => {
      const manifest = makeValidManifest({ agentId: "to-remove" });
      await registry.register(manifest);

      await registry.unregister("to-remove");

      const deregisterEvent = store.events.find((e) => e.type === "agent.deregistered");
      expect(deregisterEvent).toBeDefined();
      expect(deregisterEvent?.agentId).toBe("to-remove");
    });

    it("throws error if agent not found", async () => {
      await expect(registry.unregister("nonexistent")).rejects.toThrow("not found");
    });

    it("removes temporary agents without persistence", async () => {
      const manifest = makeValidManifest({ agentId: "temp-to-remove" });
      await registry.register(manifest, { temporary: true });
      const initialEventCount = store.events.length;

      await registry.unregister("temp-to-remove");

      expect(store.events.length).toBe(initialEventCount);
    });
  });

  describe("getAgent()", () => {
    it("returns agent metadata by ID", async () => {
      const manifest = makeValidManifest({ agentId: "get-test" });
      await registry.register(manifest);

      const agent = registry.getAgent("get-test");

      expect(agent).toBeDefined();
      expect(agent?.agentId).toBe("get-test");
      expect(agent?.name).toBe("Coder Agent");
    });

    it("returns undefined for unknown agent", () => {
      const agent = registry.getAgent("unknown");
      expect(agent).toBeUndefined();
    });
  });

  describe("listAgents()", () => {
    it("returns all registered agents", async () => {
      await registry.register(makeValidManifest({ agentId: "agent-1" }));
      await registry.register(makeValidManifest({ agentId: "agent-2" }));
      await registry.register(makeValidManifest({ agentId: "agent-3" }));

      const agents = registry.listAgents();

      expect(agents).toHaveLength(3);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["agent-1", "agent-2", "agent-3"]);
    });

    it("returns empty array when no agents registered", () => {
      const agents = registry.listAgents();
      expect(agents).toEqual([]);
    });
  });

  describe("updateHealth()", () => {
    it("updates agent health status", async () => {
      const manifest = makeValidManifest({ agentId: "health-test", health: "healthy" });
      await registry.register(manifest);

      await registry.updateHealth("health-test", "degraded");

      const agent = registry.getAgent("health-test");
      expect(agent?.health).toBe("degraded");
    });

    it("persists health change event to store", async () => {
      const manifest = makeValidManifest({ agentId: "health-persist" });
      await registry.register(manifest);

      await registry.updateHealth("health-persist", "unavailable");

      const healthEvent = store.events.find((e) => e.type === "agent.health-changed");
      expect(healthEvent).toBeDefined();
    });

    it("throws error if agent not found", async () => {
      await expect(registry.updateHealth("unknown", "healthy")).rejects.toThrow("not found");
    });
  });

  describe("restore()", () => {
    it("rebuilds registry from event store", async () => {
      // Register some agents
      await registry.register(makeValidManifest({ agentId: "restore-1" }));
      await registry.register(makeValidManifest({ agentId: "restore-2" }));

      // Create a new registry with the same store
      const newRegistry = new AgentRegistry({ store });
      await newRegistry.restore();

      const agents = newRegistry.listAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["restore-1", "restore-2"]);
    });

    it("applies deregistration events during restore", async () => {
      await registry.register(makeValidManifest({ agentId: "temp-restore" }));
      await registry.unregister("temp-restore");

      const newRegistry = new AgentRegistry({ store });
      await newRegistry.restore();

      const agent = newRegistry.getAgent("temp-restore");
      expect(agent).toBeUndefined();
    });

    it("applies health changes during restore", async () => {
      await registry.register(makeValidManifest({ agentId: "health-restore", health: "healthy" }));
      await registry.updateHealth("health-restore", "degraded");

      const newRegistry = new AgentRegistry({ store });
      await newRegistry.restore();

      const agent = newRegistry.getAgent("health-restore");
      expect(agent?.health).toBe("degraded");
    });
  });

  describe("getAgentVersion()", () => {
    it("returns current version of agent", async () => {
      await registry.register(makeValidManifest({ agentId: "version-test" }));

      const version = registry.getAgentVersion("version-test");
      expect(version).toBe(1);
    });

    it("returns undefined for unknown agent", () => {
      const version = registry.getAgentVersion("unknown");
      expect(version).toBeUndefined();
    });
  });
});
