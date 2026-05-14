import { performance } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";
import { HeartbeatMonitor } from "../agent-health/heartbeat-monitor";
import { AgentDiscoveryService } from "../agent-registry/discovery";
import { AgentRegistry } from "../agent-registry/registry";
import { AgentScheduler } from "./scheduler";

function createMonitor(registry: AgentRegistry) {
  return new HeartbeatMonitor({
    registry,
    config: {
      intervalMs: 10000,
      timeoutMs: 10000,
      maxMissedHeartbeats: 3
    }
  });
}

describe("agent-scheduler/scheduler", () => {
  let registry: AgentRegistry;
  let discovery: AgentDiscoveryService;
  let monitor: HeartbeatMonitor;
  let scheduler: AgentScheduler;

  beforeEach(() => {
    registry = new AgentRegistry();
    discovery = new AgentDiscoveryService(registry);
    monitor = createMonitor(registry);
    scheduler = new AgentScheduler({ registry, discovery, monitor });
  });

  it("assigns tasks to the least loaded capable agent by capacity ratio", async () => {
    await registry.register({
      agentId: "agent-a",
      capabilities: ["review"],
      metadata: { maxConcurrentTasks: 1 }
    });
    await registry.register({
      agentId: "agent-b",
      capabilities: ["review"],
      metadata: { maxConcurrentTasks: 2 }
    });

    const first = scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["review"]
    });
    const second = scheduler.assignTask({
      taskId: "task-2",
      requiredCapabilities: ["review"]
    });
    const third = scheduler.assignTask({
      taskId: "task-3",
      requiredCapabilities: ["review"]
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(third.success).toBe(true);
    if (!first.success || !second.success || !third.success) {
      return;
    }

    expect(first.assignment.agentId).toBe("agent-a");
    expect(second.assignment.agentId).toBe("agent-b");
    expect(third.assignment.agentId).toBe("agent-b");
    expect(scheduler.getAgentLoads()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "agent-a",
          activeAssignments: 1,
          capacity: 1,
          loadRatio: 1
        }),
        expect.objectContaining({
          agentId: "agent-b",
          activeAssignments: 2,
          capacity: 2,
          loadRatio: 1
        })
      ])
    );
  });

  it("does not assign tasks to offline or unhealthy agents", async () => {
    await registry.register({
      agentId: "offline-agent",
      capabilities: ["execution"],
      status: "offline"
    });
    await registry.register({
      agentId: "unhealthy-agent",
      capabilities: ["execution"],
      status: "unhealthy"
    });

    const result = scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["execution"]
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.assignment.status).toBe("operator_attention");
    expect(result.assignment.attentionReason).toContain("No healthy capable agent");
  });

  it("uses agentId as a stable tie-breaker for equal candidates", async () => {
    await registry.register({
      agentId: "agent-b",
      capabilities: ["analysis"],
      metadata: { maxConcurrentTasks: 2 }
    });
    await registry.register({
      agentId: "agent-a",
      capabilities: ["analysis"],
      metadata: { maxConcurrentTasks: 2 }
    });

    const result = scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["analysis"]
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.assignment.agentId).toBe("agent-a");
  });

  it("handles a bounded local fixture with 250 agents under 200ms", async () => {
    for (let index = 0; index < 250; index += 1) {
      await registry.register({
        agentId: `scale-agent-${String(index).padStart(3, "0")}`,
        capabilities: ["scale"],
        metadata: { maxConcurrentTasks: 4 }
      });
    }

    const startedAt = performance.now();
    const result = scheduler.assignTask({
      taskId: "scale-task",
      requiredCapabilities: ["scale"]
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.success).toBe(true);
    expect(elapsedMs).toBeLessThan(200);
  });

  it("reassigns active tasks when an assigned agent becomes unhealthy", async () => {
    await registry.register({
      agentId: "agent-a",
      capabilities: ["code-generation"],
      metadata: { maxConcurrentTasks: 1 }
    });
    await registry.register({
      agentId: "agent-b",
      capabilities: ["code-generation"],
      metadata: { maxConcurrentTasks: 1 }
    });
    const assigned = scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["code-generation"]
    });
    expect(assigned.success).toBe(true);

    await registry.setStatus("agent-a", "unhealthy");
    const recovery = scheduler.recoverAssignments("agent-a");

    expect(recovery.reassigned).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        fromAgentId: "agent-a",
        toAgentId: "agent-b"
      })
    ]);
    expect(scheduler.getAssignments()).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        agentId: "agent-b",
        status: "active"
      })
    ]);
  });

  it("moves unrecoverable tasks to operator attention", async () => {
    await registry.register({
      agentId: "agent-a",
      capabilities: ["incident-response"],
      metadata: { maxConcurrentTasks: 1 }
    });
    const assigned = scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["incident-response"]
    });
    expect(assigned.success).toBe(true);

    await registry.setStatus("agent-a", "unhealthy");
    const recovery = scheduler.recoverAssignments("agent-a");

    expect(recovery.operatorAttention).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        fromAgentId: "agent-a"
      })
    ]);
    expect(scheduler.getAssignments()).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        agentId: "agent-a",
        status: "operator_attention",
        attentionReason: expect.stringContaining("No healthy replacement agent")
      })
    ]);
  });
});
