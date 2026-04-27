import { describe, it, expect } from "vitest";
import {
  validateManifest,
  type AgentManifest,
  type AgentCapability,
  type AgentHealthStatus,
  type AgentRegistryEvent,
  type RuntimeHint,
  type ValidationResult,
} from "./types";

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

describe("AgentManifest type validation", () => {
  it("accepts a valid manifest with all required fields", () => {
    const manifest = makeValidManifest();
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a null value", () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("non-null object");
  });

  it("rejects a non-object value", () => {
    const result = validateManifest("not an object");
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("non-null object");
  });

  it("requires agentId field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).agentId;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "agentId")).toBe(true);
  });

  it("requires name field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).name;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "name")).toBe(true);
  });

  it("requires version field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).version;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "version")).toBe(true);
  });

  it("requires capabilities field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).capabilities;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "capabilities")).toBe(true);
  });

  it("requires inputSchema field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).inputSchema;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "inputSchema")).toBe(true);
  });

  it("requires outputSchema field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).outputSchema;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "outputSchema")).toBe(true);
  });

  it("requires runtimeHints field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).runtimeHints;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "runtimeHints")).toBe(true);
  });

  it("requires health field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).health;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "health")).toBe(true);
  });

  it("requires registeredAt field", () => {
    const manifest = makeValidManifest();
    delete (manifest as Record<string, unknown>).registeredAt;
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "registeredAt")).toBe(true);
  });
});

describe("AgentCapability validation", () => {
  it("rejects empty capabilities array", () => {
    const manifest = makeValidManifest({ capabilities: [] });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "capabilities")).toBe(true);
  });

  it("requires each capability to have an id", () => {
    const manifest = makeValidManifest({
      capabilities: [{ name: "Code Generation", description: "Generates code" } as AgentCapability],
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("capabilities") && e.path.includes("id"))).toBe(true);
  });

  it("requires each capability to have a name", () => {
    const manifest = makeValidManifest({
      capabilities: [{ id: "code-generation", description: "Generates code" } as AgentCapability],
    });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("capabilities") && e.path.includes("name"))).toBe(true);
  });
});

describe("AgentHealthStatus validation", () => {
  it.each(["healthy", "degraded", "unavailable"] satisfies AgentHealthStatus[])(
    "accepts valid health status: %s",
    (status) => {
      const manifest = makeValidManifest({ health: status });
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
    }
  );

  it("rejects invalid health status", () => {
    const manifest = makeValidManifest({ health: "unknown" as AgentHealthStatus });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "health")).toBe(true);
  });
});

describe("registeredAt timestamp validation", () => {
  it("accepts valid ISO 8601 timestamp", () => {
    const manifest = makeValidManifest({ registeredAt: "2026-04-27T10:00:00Z" });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid timestamp format", () => {
    const manifest = makeValidManifest({ registeredAt: "not-a-date" });
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "registeredAt")).toBe(true);
  });
});

describe("AgentRegistryEvent type", () => {
  it("supports agent.registered event type", () => {
    const event: AgentRegistryEvent = {
      type: "agent.registered",
      agentId: "coder-v1",
      timestamp: new Date().toISOString(),
    };
    expect(event.type).toBe("agent.registered");
    expect(event.agentId).toBe("coder-v1");
  });

  it("supports agent.deregistered event type", () => {
    const event: AgentRegistryEvent = {
      type: "agent.deregistered",
      agentId: "coder-v1",
      timestamp: new Date().toISOString(),
    };
    expect(event.type).toBe("agent.deregistered");
  });

  it("supports agent.health-changed event type", () => {
    const event: AgentRegistryEvent = {
      type: "agent.health-changed",
      agentId: "coder-v1",
      health: "degraded",
      timestamp: new Date().toISOString(),
    };
    expect(event.type).toBe("agent.health-changed");
    expect(event.health).toBe("degraded");
  });
});

describe("RuntimeHint type", () => {
  it("supports all optional fields", () => {
    const hints: RuntimeHint = {
      estimatedDurationMs: 5000,
      memoryMb: 512,
      concurrent: true,
      priority: 2,
    };
    expect(hints.estimatedDurationMs).toBe(5000);
    expect(hints.memoryMb).toBe(512);
    expect(hints.concurrent).toBe(true);
    expect(hints.priority).toBe(2);
  });

  it("allows empty runtime hints", () => {
    const hints: RuntimeHint = {};
    expect(hints.estimatedDurationMs).toBeUndefined();
  });
});
