import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { HeartbeatMonitor } from "../agent-health/heartbeat-monitor";
import { AgentDiscoveryService } from "../agent-registry/discovery";
import { AgentRegistry } from "../agent-registry/registry";
import { createGatewayApp } from "../server";
import { BottleneckAnalyzer } from "../agent-scheduler/bottleneck-analyzer";
import { AgentScheduler } from "../agent-scheduler/scheduler";
import { registerAgentSchedulerRoutes } from "./agent-scheduler";

function createRouteFixture() {
  const app = Fastify({ logger: false });
  const registry = new AgentRegistry();
  const discovery = new AgentDiscoveryService(registry);
  const monitor = new HeartbeatMonitor({
    registry,
    config: {
      intervalMs: 10000,
      timeoutMs: 10000,
      maxMissedHeartbeats: 3
    }
  });
  const scheduler = new AgentScheduler({ registry, discovery, monitor });
  const analyzer = new BottleneckAnalyzer({ registry, monitor, scheduler });
  registerAgentSchedulerRoutes(app, { scheduler, analyzer });
  return { app, registry, scheduler };
}

describe("acp-gateway agent scheduler routes", () => {
  it("creates assignments, exposes loads, and releases assignments", async () => {
    const { app, registry } = createRouteFixture();
    await registry.register({
      agentId: "agent-a",
      capabilities: ["review"],
      metadata: { maxConcurrentTasks: 2 }
    });

    const assigned = await app.inject({
      method: "POST",
      url: "/agent-scheduler/assign",
      payload: {
        taskId: "task-1",
        requiredCapabilities: ["review"]
      }
    });

    expect(assigned.statusCode).toBe(201);
    expect(assigned.json()).toEqual(
      expect.objectContaining({
        taskId: "task-1",
        agentId: "agent-a",
        status: "active"
      })
    );

    const loads = await app.inject({
      method: "GET",
      url: "/agent-scheduler/loads"
    });

    expect(loads.statusCode).toBe(200);
    expect(loads.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "agent-a",
          activeAssignments: 1,
          capacity: 2
        })
      ])
    );

    const released = await app.inject({
      method: "POST",
      url: `/agent-scheduler/${assigned.json().assignmentId}/release`
    });

    expect(released.statusCode).toBe(200);
    expect(released.json()).toEqual(
      expect.objectContaining({
        assignmentId: assigned.json().assignmentId,
        status: "released"
      })
    );
  });

  it("returns 409 with operator-attention assignment when no candidate is available", async () => {
    const { app, registry } = createRouteFixture();
    await registry.register({
      agentId: "agent-a",
      capabilities: ["execution"],
      status: "offline"
    });

    const response = await app.inject({
      method: "POST",
      url: "/agent-scheduler/assign",
      payload: {
        taskId: "task-1",
        requiredCapabilities: ["execution"]
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(
      expect.objectContaining({
        taskId: "task-1",
        status: "operator_attention",
        attentionReason: expect.stringContaining("No healthy capable agent")
      })
    );
  });

  it("exposes bottleneck reports", async () => {
    const { app, registry } = createRouteFixture();
    await registry.register({
      agentId: "agent-a",
      capabilities: ["review"],
      metadata: { maxConcurrentTasks: 1 }
    });

    await app.inject({
      method: "POST",
      url: "/agent-scheduler/assign",
      payload: {
        taskId: "task-1",
        requiredCapabilities: ["review"]
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/agent-scheduler/bottlenecks"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().bottlenecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "overloaded_agent",
          agentIds: ["agent-a"]
        })
      ])
    );
  });

  it("returns 400 for invalid assignment payloads", async () => {
    const { app } = createRouteFixture();

    const response = await app.inject({
      method: "POST",
      url: "/agent-scheduler/assign",
      payload: {
        taskId: "",
        requiredCapabilities: []
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("Invalid assignment payload");
  });

  it("registers scheduler routes in the default gateway app", async () => {
    const app = createGatewayApp({
      logger: false,
      codexRunner: {
        async run() {
          return {};
        }
      }
    });

    await app.ready();
    const response = await app.inject({
      method: "GET",
      url: "/agent-scheduler/loads"
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: "intake-agent" })
      ])
    );
  });
});
