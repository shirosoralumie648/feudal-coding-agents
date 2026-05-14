import type { AgentDiscoveryService } from "../agent-registry/discovery";
import type { AgentRegistry } from "../agent-registry/registry";
import type { AgentHealthSummary, FailoverResult, HealthEvent } from "./types";
import type { HealthEventStore, HeartbeatMonitor } from "./heartbeat-monitor";

interface TaskAssignment {
  taskId: string;
  agentId: string;
  capabilities: string[];
}

export class FailoverHandler {
  private readonly assignments = new Map<string, TaskAssignment>();
  private readonly eventStore: HealthEventStore | undefined;

  constructor(
    private readonly options: {
      monitor: HeartbeatMonitor;
      registry: AgentRegistry;
      discovery: AgentDiscoveryService;
      eventStore?: HealthEventStore;
    }
  ) {
    this.eventStore = options.eventStore;
    this.options.monitor.onEvent((event) => {
      if (event.eventType === "status_changed" && event.newStatus === "unhealthy") {
        void this.handleFailover(event.agentId);
      }
    });
  }

  registerTask(taskId: string, agentId: string, capabilities: string[]): void {
    this.assignments.set(taskId, {
      taskId,
      agentId,
      capabilities
    });
  }

  unregisterTask(taskId: string): void {
    this.assignments.delete(taskId);
  }

  getTasksByAgent(agentId: string): string[] {
    return [...this.assignments.values()]
      .filter((assignment) => assignment.agentId === agentId)
      .map((assignment) => assignment.taskId);
  }

  async handleFailover(unhealthyAgentId: string): Promise<FailoverResult> {
    const affectedTasks = [...this.assignments.values()].filter(
      (assignment) => assignment.agentId === unhealthyAgentId
    );
    const reassigned: FailoverResult["reassigned"] = [];
    const operatorAttention: FailoverResult["operatorAttention"] = [];

    for (const assignment of affectedTasks) {
      const replacement = this.findReplacementAgent(
        assignment.capabilities,
        unhealthyAgentId
      );

      if (!replacement) {
        operatorAttention.push({
          taskId: assignment.taskId,
          fromAgentId: unhealthyAgentId,
          reason: `No healthy replacement agent available for capabilities: ${assignment.capabilities.join(", ")}`
        });
        continue;
      }

      await this.reassignTask(assignment.taskId, unhealthyAgentId, replacement.agentId);
      reassigned.push({
        taskId: assignment.taskId,
        fromAgentId: unhealthyAgentId,
        toAgentId: replacement.agentId
      });
    }

    await this.eventStore?.append({
      eventType: "failover_triggered",
      agentId: unhealthyAgentId,
      timestamp: new Date(),
      metadata: {
        reassigned,
        operatorAttention
      }
    } satisfies HealthEvent);

    return {
      reassigned,
      operatorAttention
    };
  }

  findReplacementAgent(capabilities: string[], excludedAgentId?: string): AgentHealthSummary & {
    agentId: string;
  } | undefined {
    const candidates = this.options.discovery.query({
      status: ["online", "busy"]
    }).agents.filter((agent) => {
      if (agent.agentId === excludedAgentId) {
        return false;
      }

      return capabilities.every((capability) => agent.capabilities.includes(capability));
    });

    candidates.sort((left, right) => {
      const leftLoad = this.getTasksByAgent(left.agentId).length;
      const rightLoad = this.getTasksByAgent(right.agentId).length;
      return leftLoad - rightLoad;
    });

    const winner = candidates[0];
    if (!winner) {
      return undefined;
    }

    return {
      agentId: winner.agentId,
      status: this.options.monitor.getAgentHealth(winner.agentId)?.status ?? "unknown",
      lastHeartbeat: winner.lastHeartbeat,
      missedCount: this.options.monitor.getAgentHealth(winner.agentId)?.missedCount ?? 0
    };
  }

  async reassignTask(taskId: string, fromAgentId: string, toAgentId: string): Promise<void> {
    const assignment = this.assignments.get(taskId);
    if (!assignment || assignment.agentId !== fromAgentId) {
      return;
    }

    assignment.agentId = toAgentId;
  }
}
