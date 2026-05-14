import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentDiscoveryService } from "./discovery";
import { AgentRegistry } from "./registry";

describe("agent-registry/discovery", () => {
  let registry: AgentRegistry;
  let discovery: AgentDiscoveryService;

  beforeEach(async () => {
    registry = new AgentRegistry();
    discovery = new AgentDiscoveryService(registry);

    await registry.register({
      agentId: "code-gen",
      capabilities: ["code-generation", "refactoring"],
      metadata: { region: "cn", tier: "primary" },
      status: "online"
    });

    await registry.register({
      agentId: "code-review",
      capabilities: ["code-review", "refactoring"],
      metadata: { region: "cn", tier: "secondary" },
      status: "busy"
    });

    await registry.register({
      agentId: "doc-writer",
      capabilities: ["documentation"],
      metadata: { region: "eu", tier: "secondary" },
      status: "offline"
    });
  });

  it("finds agents by exact capability", () => {
    const agents = discovery.findByCapability("refactoring");
    expect(agents.map((agent) => agent.agentId).sort()).toEqual([
      "code-gen",
      "code-review"
    ]);
  });

  it("matches glob capability patterns like code-*", () => {
    const agents = discovery.findByCapabilityPattern("code-*");
    expect(agents.map((agent) => agent.agentId).sort()).toEqual([
      "code-gen",
      "code-review"
    ]);
  });

  it("matches regular expression capability filters", () => {
    const agents = discovery.query({
      capabilities: /^code-/
    });

    expect(agents.agents.map((agent) => agent.agentId).sort()).toEqual([
      "code-gen",
      "code-review"
    ]);
  });

  it("filters by agent status", () => {
    const agents = discovery.findByStatus(["online", "busy"]);
    expect(agents.map((agent) => agent.agentId).sort()).toEqual([
      "code-gen",
      "code-review"
    ]);
  });

  it("filters by exact metadata matches", () => {
    const agents = discovery.findByMetadata({
      region: "cn",
      tier: "secondary"
    });

    expect(agents.map((agent) => agent.agentId)).toEqual(["code-review"]);
  });

  it("combines capability, status, and metadata filters", () => {
    const result = discovery.query({
      capabilityPattern: "code-*",
      status: ["busy"],
      metadata: { region: "cn" }
    });

    expect(result.total).toBe(1);
    expect(result.agents[0]?.agentId).toBe("code-review");
  });

  it("notifies watchers when matching agents change", async () => {
    const callback = vi.fn();
    const unsubscribe = discovery.watch({ status: ["online"] }, callback);

    await registry.setStatus("code-gen", "busy");

    expect(callback).toHaveBeenCalledWith([]);

    unsubscribe();
  });
});
