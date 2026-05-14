import { beforeEach, describe, expect, it } from "vitest";
import { HeartbeatMonitor } from "../agent-health/heartbeat-monitor";
import { AgentDiscoveryService } from "../agent-registry/discovery";
import { AgentRegistry } from "../agent-registry/registry";
import { BottleneckAnalyzer } from "./bottleneck-analyzer";
import { AgentScheduler } from "./scheduler";

function createSchedulerFixture() {
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
  return { registry, monitor, scheduler, analyzer };
}

describe("agent-scheduler/bottleneck-analyzer", () => {
  let fixture: ReturnType<typeof createSchedulerFixture>;

  beforeEach(() => {
    fixture = createSchedulerFixture();
  });

  it("reports overloaded agents and saturated fleet capacity", async () => {
    await fixture.registry.register({
      agentId: "agent-a",
      capabilities: ["review"],
      metadata: { maxConcurrentTasks: 1 }
    });

    const assigned = fixture.scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["review"]
    });

    expect(assigned.success).toBe(true);
    const report = fixture.analyzer.analyze();

    expect(report.bottlenecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "overloaded_agent",
          severity: "medium",
          agentIds: ["agent-a"]
        }),
        expect.objectContaining({
          category: "fleet_saturation",
          capability: "review",
          severity: "medium"
        })
      ])
    );
  });

  it("reports missing capability capacity for operator-attention assignments", async () => {
    await fixture.registry.register({
      agentId: "agent-a",
      capabilities: ["execution"],
      metadata: { maxConcurrentTasks: 1 }
    });

    fixture.scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["execution"]
    });
    const failed = fixture.scheduler.assignTask({
      taskId: "task-2",
      requiredCapabilities: ["execution"]
    });

    expect(failed.success).toBe(false);
    const report = fixture.analyzer.analyze();

    expect(report.bottlenecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "missing_capability_capacity",
          severity: "high",
          taskIds: ["task-2"],
          recommendation: expect.stringContaining("Register")
        })
      ])
    );
  });

  it("reports active assignments that are still attached to unhealthy agents", async () => {
    await fixture.registry.register({
      agentId: "agent-a",
      capabilities: ["analysis"],
      metadata: { maxConcurrentTasks: 2 }
    });
    fixture.scheduler.assignTask({
      taskId: "task-1",
      requiredCapabilities: ["analysis"]
    });

    await fixture.registry.setStatus("agent-a", "unhealthy");
    const report = fixture.analyzer.analyze();

    expect(report.bottlenecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "unhealthy_assignment",
          severity: "critical",
          agentIds: ["agent-a"],
          taskIds: ["task-1"]
        })
      ])
    );
  });
});
