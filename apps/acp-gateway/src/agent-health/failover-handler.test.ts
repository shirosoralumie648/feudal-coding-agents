import { beforeEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../agent-registry/registry";
import { AgentDiscoveryService } from "../agent-registry/discovery";
import { AgentMessageRouter } from "../agent-protocol/message-router";
import { FailoverHandler } from "./failover-handler";
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

describe("agent-health/failover-handler", () => {
  let registry: AgentRegistry;
  let discovery: AgentDiscoveryService;
  let monitor: HeartbeatMonitor;
  let router: AgentMessageRouter;
  let handler: FailoverHandler;
  let store: ReturnType<typeof createHealthStore>;

  beforeEach(async () => {
    registry = new AgentRegistry();
    discovery = new AgentDiscoveryService(registry);
    router = new AgentMessageRouter({ registry });
    store = createHealthStore();

    await registry.register({
      agentId: "agent-a",
      capabilities: ["code-generation"],
      status: "unhealthy"
    });
    await registry.register({
      agentId: "agent-b",
      capabilities: ["code-generation"],
      status: "online"
    });
    await registry.register({
      agentId: "agent-c",
      capabilities: ["documentation"],
      status: "online"
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

    handler = new FailoverHandler({
      monitor,
      registry,
      discovery,
      eventStore: store
    });
  });

  it("reassigns tasks to a healthy replacement agent with the same capability", async () => {
    handler.registerTask("task-1", "agent-a", ["code-generation"]);

    const result = await handler.handleFailover("agent-a");

    expect(result.reassigned).toEqual([
      {
        taskId: "task-1",
        fromAgentId: "agent-a",
        toAgentId: "agent-b"
      }
    ]);
    expect(handler.getTasksByAgent("agent-b")).toEqual(["task-1"]);
  });

  it("surfaces operator attention when no replacement agent is available", async () => {
    handler.registerTask("task-2", "agent-a", ["incident-response"]);

    const result = await handler.handleFailover("agent-a");

    expect(result.operatorAttention).toEqual([
      {
        taskId: "task-2",
        fromAgentId: "agent-a",
        reason: 'No healthy replacement agent available for capabilities: incident-response'
      }
    ]);
  });
});
