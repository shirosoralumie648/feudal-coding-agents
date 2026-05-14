import { beforeEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../agent-registry/registry";
import { createJsonRpcRequest } from "./json-rpc";
import { AgentMessageRouter, type MessageRouterAuditStore } from "./message-router";

function createAuditStore(): MessageRouterAuditStore & { entries: unknown[] } {
  const entries: unknown[] = [];

  return {
    entries,
    async append(entry) {
      entries.push(entry);
    }
  };
}

describe("agent-protocol/message-router", () => {
  let registry: AgentRegistry;
  let auditStore: ReturnType<typeof createAuditStore>;
  let router: AgentMessageRouter;

  beforeEach(async () => {
    registry = new AgentRegistry();
    auditStore = createAuditStore();
    router = new AgentMessageRouter({ registry, auditStore });

    await registry.register({
      agentId: "agent-a",
      capabilities: ["code-generation"],
      status: "online"
    });
    await registry.register({
      agentId: "agent-b",
      capabilities: ["code-review"],
      status: "online"
    });
    await registry.register({
      agentId: "agent-c",
      capabilities: ["code-refactor"],
      status: "busy"
    });
  });

  it("delivers direct messages to a target mailbox", async () => {
    const result = await router.send(
      createJsonRpcRequest({
        id: "550e8400-e29b-41d4-a716-446655440010",
        method: "agent.ping",
        params: {},
        from: "agent-a",
        to: "agent-b"
      })
    );

    expect(result.delivered).toBe(true);
    expect(router.getPendingMessages("agent-b")).toHaveLength(1);
  });

  it("broadcasts to all registered agents except the sender", async () => {
    const result = await router.broadcast({
      method: "agent.status",
      params: { status: "ready" },
      from: "agent-a"
    });

    expect(result.deliveredTo.sort()).toEqual(["agent-b", "agent-c"]);
    expect(router.getPendingMessages("agent-a")).toHaveLength(0);
  });

  it("routes by capability pattern", () => {
    expect(router.routeByCapability("code-*").sort()).toEqual([
      "agent-a",
      "agent-b",
      "agent-c"
    ]);
  });

  it("logs deliveries for audit", async () => {
    await router.send(
      createJsonRpcRequest({
        id: "550e8400-e29b-41d4-a716-446655440011",
        method: "agent.ping",
        params: {},
        from: "agent-a",
        to: "agent-b"
      })
    );

    expect(auditStore.entries).toHaveLength(1);
  });

  it("returns delivery failures for unknown agents", async () => {
    const result = await router.send(
      createJsonRpcRequest({
        id: "550e8400-e29b-41d4-a716-446655440012",
        method: "agent.ping",
        params: {},
        from: "agent-a",
        to: "missing-agent"
      })
    );

    expect(result.delivered).toBe(false);
    expect(result.deliveries[0]).toEqual(
      expect.objectContaining({
        agentId: "missing-agent",
        delivered: false
      })
    );
  });
});
