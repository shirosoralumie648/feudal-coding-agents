import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentDiscoveryService } from "./discovery";
import { AgentRegistry, type AgentRegistryStore } from "./registry";
import type { AgentManifest, AgentHealthStatus } from "./types";

function makeManifest(overrides: Partial<AgentManifest> & Pick<AgentManifest, "agentId">): AgentManifest {
  return {
    name: `${overrides.agentId} Agent`,
    version: "1.0.0",
    description: `Agent ${overrides.agentId}`,
    capabilities: [{ id: "generic", name: "Generic", description: "Generic capability" }],
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    runtimeHints: {},
    health: "healthy",
    registeredAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockStore(): AgentRegistryStore {
  const events: unknown[] = [];
  return {
    events,
    async append(event: unknown) {
      events.push(event);
    },
    async loadEvents() {
      return [];
    },
  };
}

describe("AgentDiscoveryService", () => {
  let registry: AgentRegistry;
  let discovery: AgentDiscoveryService;

  beforeEach(async () => {
    const store = createMockStore();
    registry = new AgentRegistry({ store });
    discovery = new AgentDiscoveryService(registry);

    // Register some test agents
    await registry.register(makeManifest({
      agentId: "code-gen",
      capabilities: [
        { id: "code-generation", name: "Code Generation", description: "Generates source code" },
        { id: "refactoring", name: "Refactoring", description: "Code refactoring" },
      ],
      health: "healthy",
    }));

    await registry.register(makeManifest({
      agentId: "code-review",
      capabilities: [
        { id: "code-review", name: "Code Review", description: "Reviews source code" },
        { id: "refactoring", name: "Refactoring", description: "Code refactoring" },
      ],
      health: "healthy",
    }));

    await registry.register(makeManifest({
      agentId: "doc-writer",
      capabilities: [
        { id: "documentation", name: "Documentation", description: "Generates documentation" },
      ],
      health: "degraded",
    }));

    await registry.register(makeManifest({
      agentId: "test-runner",
      capabilities: [
        { id: "testing", name: "Testing", description: "Runs tests" },
        { id: "code-generation", name: "Code Generation", description: "Generates source code" },
      ],
      health: "unavailable",
    }));
  });

  describe("findByCapability()", () => {
    it("returns agents with matching capability", () => {
      const agents = discovery.findByCapability("code-generation");

      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["code-gen", "test-runner"]);
    });

    it("returns empty array when no agents match", () => {
      const agents = discovery.findByCapability("nonexistent");
      expect(agents).toHaveLength(0);
    });

    it("returns agents sharing a capability", () => {
      const agents = discovery.findByCapability("refactoring");

      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["code-gen", "code-review"]);
    });
  });

  describe("findByCapabilityPattern()", () => {
    it("matches glob-style pattern 'code-*' per D-07", () => {
      const agents = discovery.findByCapabilityPattern("code-*");

      expect(agents).toHaveLength(3);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["code-gen", "code-review", "test-runner"]);
    });

    it("matches RegExp pattern", () => {
      const agents = discovery.findByCapabilityPattern(/^code-/);

      expect(agents).toHaveLength(3);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["code-gen", "code-review", "test-runner"]);
    });

    it("returns empty array when pattern matches nothing", () => {
      const agents = discovery.findByCapabilityPattern("xyz-*");
      expect(agents).toHaveLength(0);
    });
  });

  describe("findByHealth()", () => {
    it("returns agents with matching health status", () => {
      const agents = discovery.findByHealth("healthy");

      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["code-gen", "code-review"]);
    });

    it("supports multiple health statuses", () => {
      const agents = discovery.findByHealth(["degraded", "unavailable"]);

      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["doc-writer", "test-runner"]);
    });

    it("returns empty array when no agents match", () => {
      const agents = discovery.findByHealth("nonexistent" as AgentHealthStatus);
      expect(agents).toHaveLength(0);
    });
  });

  describe("query()", () => {
    it("supports combined filters", () => {
      const agents = discovery.query({
        capabilities: ["code-generation"],
        health: ["healthy"],
      });

      expect(agents).toHaveLength(1);
      expect(agents[0].agentId).toBe("code-gen");
    });

    it("returns all agents when no filters provided", () => {
      const agents = discovery.query({});

      expect(agents).toHaveLength(4);
    });

    it("filters by capability pattern", () => {
      const agents = discovery.query({
        capabilityPattern: "code-*",
      });

      expect(agents).toHaveLength(3);
    });

    it("combines capability and health filters", () => {
      const agents = discovery.query({
        capabilityPattern: "code-*",
        health: ["healthy"],
      });

      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.agentId).sort()).toEqual(["code-gen", "code-review"]);
    });
  });

  describe("watch()", () => {
    it("notifies callback when matching agent changes health", async () => {
      const callback = vi.fn<[AgentManifest[]], void>();

      discovery.watch({ health: ["healthy"] }, callback);

      await registry.updateHealth("code-gen", "degraded");

      expect(callback).toHaveBeenCalled();
    });

    it("returns unsubscribe function", async () => {
      const callback = vi.fn<[AgentManifest[]], void>();

      const unsubscribe = discovery.watch({ health: ["healthy"] }, callback);

      unsubscribe();
      await registry.updateHealth("code-gen", "degraded");

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
