import { z } from "zod";

const DateSchema = z.coerce.date();

export const HeartbeatConfigSchema = z.object({
  intervalMs: z.number().int().min(5000).max(300000),
  timeoutMs: z.number().int().min(5000).max(300000),
  maxMissedHeartbeats: z.number().int().min(1).default(3)
});

export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;

export const AgentHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "unhealthy",
  "unknown"
]);

export type AgentHealthStatus = z.infer<typeof AgentHealthStatusSchema>;

export const HealthEventTypeSchema = z.enum([
  "heartbeat_received",
  "heartbeat_missed",
  "status_changed",
  "failover_triggered",
  "active_probe_sent",
  "active_probe_failed"
]);

export type HealthEventType = z.infer<typeof HealthEventTypeSchema>;

export const HealthEventSchema = z.object({
  eventType: HealthEventTypeSchema,
  agentId: z.string().min(1),
  timestamp: DateSchema,
  previousStatus: AgentHealthStatusSchema.optional(),
  newStatus: AgentHealthStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type HealthEvent = z.infer<typeof HealthEventSchema>;

export const FailoverConfigSchema = z.object({
  enabled: z.boolean(),
  maxRetryAttempts: z.number().int().min(1),
  retryDelayMs: z.number().int().min(0),
  notifyOperator: z.boolean()
});

export type FailoverConfig = z.infer<typeof FailoverConfigSchema>;

export interface HealthCheckResult {
  agentId: string;
  status: AgentHealthStatus;
  missedHeartbeats: number;
  lastHeartbeat?: Date;
  ok: boolean;
  responseTimeMs?: number;
}

export interface AgentHealthSummary {
  agentId: string;
  status: AgentHealthStatus;
  lastHeartbeat?: Date;
  missedCount: number;
}

export interface FailoverResult {
  reassigned: Array<{
    taskId: string;
    fromAgentId: string;
    toAgentId: string;
  }>;
  operatorAttention: Array<{
    taskId: string;
    fromAgentId: string;
    reason: string;
  }>;
}
