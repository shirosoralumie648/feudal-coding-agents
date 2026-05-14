import type { HeartbeatMonitor } from "../agent-health/heartbeat-monitor";
import type { AgentRegistry } from "../agent-registry/registry";
import type { AgentScheduler } from "./scheduler";
import type {
  AgentLoadSnapshot,
  BottleneckFinding,
  BottleneckReport,
  BottleneckSeverity
} from "./types";

function summarize(bottlenecks: BottleneckFinding[]): BottleneckReport["summary"] {
  const summary: BottleneckReport["summary"] = {
    total: bottlenecks.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  for (const finding of bottlenecks) {
    summary[finding.severity] += 1;
  }

  return summary;
}

function severityForLoad(loadRatio: number): BottleneckSeverity {
  return loadRatio >= 1.5 ? "high" : "medium";
}

export class BottleneckAnalyzer {
  constructor(
    private readonly options: {
      registry: AgentRegistry;
      monitor?: HeartbeatMonitor;
      scheduler: AgentScheduler;
    }
  ) {}

  analyze(): BottleneckReport {
    const assignments = this.options.scheduler.getAssignments();
    const loads = this.options.scheduler.getAgentLoads();
    const bottlenecks: BottleneckFinding[] = [];

    for (const load of loads) {
      if (load.activeAssignments > 0 && load.loadRatio >= 1) {
        bottlenecks.push({
          category: "overloaded_agent",
          severity: severityForLoad(load.loadRatio),
          message: `Agent ${load.agentId} is at ${(load.loadRatio * 100).toFixed(0)}% capacity`,
          recommendation: "Add capacity for this capability group or release completed assignments",
          agentIds: [load.agentId]
        });
      }
    }

    for (const assignment of assignments) {
      if (assignment.status === "operator_attention") {
        bottlenecks.push({
          category: "missing_capability_capacity",
          severity: "high",
          message: `Task ${assignment.taskId} has no schedulable agent`,
          recommendation: `Register a healthy agent with capabilities: ${assignment.requiredCapabilities.join(", ")}`,
          taskIds: [assignment.taskId],
          assignmentIds: [assignment.assignmentId]
        });
      }

      if (assignment.status === "active" && assignment.agentId) {
        const agent = this.options.registry.getAgent(assignment.agentId);
        const health = this.options.monitor?.getAgentHealth(assignment.agentId);
        if (
          !agent ||
          agent.status === "offline" ||
          agent.status === "unhealthy" ||
          health?.status === "unhealthy"
        ) {
          bottlenecks.push({
            category: "unhealthy_assignment",
            severity: "critical",
            message: `Task ${assignment.taskId} is still assigned to unhealthy agent ${assignment.agentId}`,
            recommendation: "Recover the assignment or route it to operator attention",
            agentIds: [assignment.agentId],
            taskIds: [assignment.taskId],
            assignmentIds: [assignment.assignmentId]
          });
        }
      }
    }

    for (const [capability, capabilityLoads] of this.groupLoadsByCapability(loads)) {
      const schedulable = capabilityLoads.filter(
        (load) =>
          load.status !== "offline" &&
          load.status !== "unhealthy" &&
          load.healthStatus !== "unhealthy"
      );
      if (
        schedulable.length > 0 &&
        schedulable.every((load) => load.loadRatio >= 1)
      ) {
        bottlenecks.push({
          category: "fleet_saturation",
          capability,
          severity: "medium",
          message: `All healthy agents for ${capability} are at capacity`,
          recommendation: `Add agents or capacity for capability ${capability}`,
          agentIds: schedulable.map((load) => load.agentId)
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      summary: summarize(bottlenecks),
      bottlenecks
    };
  }

  private groupLoadsByCapability(loads: AgentLoadSnapshot[]): Map<string, AgentLoadSnapshot[]> {
    const byCapability = new Map<string, AgentLoadSnapshot[]>();

    for (const load of loads) {
      for (const capability of load.capabilities) {
        byCapability.set(capability, [...(byCapability.get(capability) ?? []), load]);
      }
    }

    return byCapability;
  }
}
