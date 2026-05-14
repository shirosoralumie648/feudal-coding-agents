import { z } from "zod";
import type { AgentHealthStatus } from "../agent-health/types";
import type { AgentStatus } from "../agent-registry/types";

export const TaskAssignmentRequestSchema = z
  .object({
    taskId: z.string().min(1),
    requiredCapabilities: z.array(z.string().min(1)).min(1),
    priority: z.number().int().min(0).max(100).optional().default(0),
    estimatedCost: z.number().min(0).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export type TaskAssignmentRequestInput = z.input<typeof TaskAssignmentRequestSchema>;
export type TaskAssignmentRequest = z.infer<typeof TaskAssignmentRequestSchema>;

export const AssignmentStatusSchema = z.enum([
  "active",
  "released",
  "operator_attention"
]);

export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

export interface TaskAssignment {
  assignmentId: string;
  taskId: string;
  agentId?: string;
  requiredCapabilities: string[];
  priority: number;
  estimatedCost?: number;
  metadata?: Record<string, unknown>;
  status: AssignmentStatus;
  assignedAt: string;
  updatedAt: string;
  releasedAt?: string;
  score?: number;
  reason: string;
  attentionReason?: string;
  previousAgentIds: string[];
}

export interface AssignmentSuccess {
  success: true;
  assignment: TaskAssignment & { agentId: string; status: "active" };
}

export interface AssignmentFailure {
  success: false;
  assignment: TaskAssignment & { status: "operator_attention" };
  error: string;
}

export type AssignmentResult = AssignmentSuccess | AssignmentFailure;

export interface AgentLoadSnapshot {
  agentId: string;
  capabilities: string[];
  status: AgentStatus;
  healthStatus: AgentHealthStatus;
  missedCount: number;
  capacity: number;
  activeAssignments: number;
  loadRatio: number;
}

export interface RecoveryResult {
  reassigned: Array<{
    assignmentId: string;
    taskId: string;
    fromAgentId: string;
    toAgentId: string;
  }>;
  operatorAttention: Array<{
    assignmentId: string;
    taskId: string;
    fromAgentId: string;
    reason: string;
  }>;
}

export type BottleneckSeverity = "low" | "medium" | "high" | "critical";

export type BottleneckCategory =
  | "overloaded_agent"
  | "missing_capability_capacity"
  | "unhealthy_assignment"
  | "fleet_saturation";

export interface BottleneckFinding {
  category: BottleneckCategory;
  severity: BottleneckSeverity;
  message: string;
  recommendation: string;
  agentIds?: string[];
  taskIds?: string[];
  assignmentIds?: string[];
  capability?: string;
}

export interface BottleneckReport {
  generatedAt: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  bottlenecks: BottleneckFinding[];
}
