import { randomUUID } from "node:crypto";
import type { HeartbeatMonitor } from "../agent-health/heartbeat-monitor";
import type { AgentDiscoveryService } from "../agent-registry/discovery";
import type { AgentRegistry } from "../agent-registry/registry";
import type { AgentMetadata } from "../agent-registry/types";
import {
  TaskAssignmentRequestSchema,
  type AgentLoadSnapshot,
  type AssignmentResult,
  type RecoveryResult,
  type TaskAssignment,
  type TaskAssignmentRequest,
  type TaskAssignmentRequestInput
} from "./types";

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function matchesMetadata(
  agentMetadata: Record<string, unknown>,
  requestedMetadata: Record<string, unknown> | undefined
): boolean {
  if (!requestedMetadata) {
    return true;
  }

  return Object.entries(requestedMetadata).every(([key, value]) =>
    Object.is(agentMetadata[key], value)
  );
}

export class AgentScheduler {
  private readonly assignments = new Map<string, TaskAssignment>();

  constructor(
    private readonly options: {
      registry: AgentRegistry;
      discovery: AgentDiscoveryService;
      monitor?: HeartbeatMonitor;
    }
  ) {
    this.options.monitor?.onEvent((event) => {
      if (event.eventType === "status_changed" && event.newStatus === "unhealthy") {
        this.recoverAssignments(event.agentId);
      }
    });
  }

  assignTask(input: TaskAssignmentRequestInput): AssignmentResult {
    const request = TaskAssignmentRequestSchema.parse(input);
    const selected = this.selectCandidate(request);
    const now = new Date().toISOString();

    if (!selected) {
      const attentionReason = `No healthy capable agent available for capabilities: ${request.requiredCapabilities.join(", ")}`;
      const assignment: AssignmentResult["assignment"] = {
        assignmentId: this.createAssignmentId(),
        taskId: request.taskId,
        requiredCapabilities: request.requiredCapabilities,
        priority: request.priority,
        estimatedCost: request.estimatedCost,
        metadata: request.metadata,
        status: "operator_attention",
        assignedAt: now,
        updatedAt: now,
        reason: "No schedulable candidate",
        attentionReason,
        previousAgentIds: []
      };
      this.assignments.set(assignment.assignmentId, assignment);
      return {
        success: false,
        assignment,
        error: attentionReason
      };
    }

    const assignment: AssignmentResult["assignment"] = {
      assignmentId: this.createAssignmentId(),
      taskId: request.taskId,
      agentId: selected.agent.agentId,
      requiredCapabilities: request.requiredCapabilities,
      priority: request.priority,
      estimatedCost: request.estimatedCost,
      metadata: request.metadata,
      status: "active",
      assignedAt: now,
      updatedAt: now,
      score: selected.score,
      reason: selected.reason,
      previousAgentIds: []
    };
    this.assignments.set(assignment.assignmentId, assignment);
    return {
      success: true,
      assignment
    };
  }

  releaseAssignment(assignmentId: string): TaskAssignment | undefined {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      return undefined;
    }

    const now = new Date().toISOString();
    assignment.status = "released";
    assignment.updatedAt = now;
    assignment.releasedAt = now;
    return { ...assignment };
  }

  recoverAssignments(unhealthyAgentId: string): RecoveryResult {
    const affected = [...this.assignments.values()].filter(
      (assignment) =>
        assignment.status === "active" && assignment.agentId === unhealthyAgentId
    );
    const reassigned: RecoveryResult["reassigned"] = [];
    const operatorAttention: RecoveryResult["operatorAttention"] = [];

    for (const assignment of affected) {
      const selected = this.selectCandidate(
        {
          taskId: assignment.taskId,
          requiredCapabilities: assignment.requiredCapabilities,
          priority: assignment.priority,
          estimatedCost: assignment.estimatedCost,
          metadata: assignment.metadata
        },
        new Set([unhealthyAgentId])
      );
      const now = new Date().toISOString();

      if (!selected) {
        const reason = `No healthy replacement agent available for capabilities: ${assignment.requiredCapabilities.join(", ")}`;
        assignment.status = "operator_attention";
        assignment.updatedAt = now;
        assignment.attentionReason = reason;
        operatorAttention.push({
          assignmentId: assignment.assignmentId,
          taskId: assignment.taskId,
          fromAgentId: unhealthyAgentId,
          reason
        });
        continue;
      }

      assignment.previousAgentIds.push(unhealthyAgentId);
      assignment.agentId = selected.agent.agentId;
      assignment.status = "active";
      assignment.updatedAt = now;
      assignment.score = selected.score;
      assignment.reason = `Recovered from ${unhealthyAgentId}: ${selected.reason}`;
      assignment.attentionReason = undefined;
      reassigned.push({
        assignmentId: assignment.assignmentId,
        taskId: assignment.taskId,
        fromAgentId: unhealthyAgentId,
        toAgentId: selected.agent.agentId
      });
    }

    return {
      reassigned,
      operatorAttention
    };
  }

  getAssignments(): TaskAssignment[] {
    return [...this.assignments.values()]
      .map((assignment) => ({ ...assignment }))
      .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId));
  }

  getAgentLoads(): AgentLoadSnapshot[] {
    return this.options.registry
      .listAgents()
      .map((agent) => this.getLoadSnapshot(agent))
      .sort((left, right) => left.agentId.localeCompare(right.agentId));
  }

  private selectCandidate(
    request: TaskAssignmentRequest,
    excludedAgentIds = new Set<string>()
  ):
    | {
        agent: AgentMetadata;
        score: number;
        reason: string;
      }
    | undefined {
    const candidates = this.options.discovery
      .query({ status: ["online", "busy"] })
      .agents.filter((agent) => {
        if (excludedAgentIds.has(agent.agentId)) {
          return false;
        }

        if (
          !request.requiredCapabilities.every((capability) =>
            agent.capabilities.includes(capability)
          )
        ) {
          return false;
        }

        if (!matchesMetadata(agent.metadata, request.metadata)) {
          return false;
        }

        const load = this.getLoadSnapshot(agent);
        return load.healthStatus !== "unhealthy" && load.activeAssignments < load.capacity;
      })
      .map((agent) => {
        const load = this.getLoadSnapshot(agent);
        const healthPenalty =
          load.healthStatus === "degraded" ? 0.5 : load.healthStatus === "unknown" ? 0.05 : 0;
        const statusPenalty = agent.status === "busy" ? 0.25 : 0;
        const score = load.loadRatio + healthPenalty + statusPenalty + load.missedCount * 0.1;
        return {
          agent,
          score,
          reason: `capacity ratio ${load.loadRatio.toFixed(3)}, health ${load.healthStatus}, missed ${load.missedCount}`
        };
      });

    candidates.sort((left, right) => {
      const scoreDelta = left.score - right.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.agent.agentId.localeCompare(right.agent.agentId);
    });

    return candidates[0];
  }

  private getLoadSnapshot(agent: AgentMetadata): AgentLoadSnapshot {
    const capacity = this.getCapacity(agent);
    const activeAssignments = this.getActiveAssignmentsForAgent(agent.agentId).length;
    const health = this.options.monitor?.getAgentHealth(agent.agentId);

    return {
      agentId: agent.agentId,
      capabilities: [...agent.capabilities],
      status: agent.status,
      healthStatus: health?.status ?? "unknown",
      missedCount: health?.missedCount ?? 0,
      capacity,
      activeAssignments,
      loadRatio: activeAssignments / capacity
    };
  }

  private getCapacity(agent: AgentMetadata): number {
    const maxConcurrentTasks = readPositiveNumber(agent.metadata.maxConcurrentTasks, 1);
    const schedulingWeight = readPositiveNumber(agent.metadata.schedulingWeight, 1);
    return Math.max(1, Math.floor(maxConcurrentTasks * schedulingWeight));
  }

  private getActiveAssignmentsForAgent(agentId: string): TaskAssignment[] {
    return [...this.assignments.values()].filter(
      (assignment) => assignment.status === "active" && assignment.agentId === agentId
    );
  }

  private createAssignmentId(): string {
    return `assignment-${randomUUID()}`;
  }
}
