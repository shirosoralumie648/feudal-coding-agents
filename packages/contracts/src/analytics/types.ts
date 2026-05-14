import { z } from "zod";

const AnalyticsTokenUsageSummarySchema = z.object({
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  byAgent: z.array(
    z.object({
      agent: z.string(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
      runCount: z.number().int().nonnegative()
    })
  )
});

export const MetricSnapshotSchema = z.object({
  timestamp: z.string().datetime(),
  tasksByStatus: z.record(z.string(), z.number().int().nonnegative()),
  runsByAgent: z.record(z.string(), z.number().int().nonnegative()),
  runsByStatus: z.record(z.string(), z.number().int().nonnegative()),
  totalTaskCount: z.number().int().nonnegative(),
  totalRunCount: z.number().int().nonnegative(),
  awaitingApproval: z.number().int().nonnegative(),
  recoveryRequired: z.number().int().nonnegative(),
  avgApprovalLatencyMs: z.number().nonnegative().nullable(),
  errorRate: z.number().min(0).max(1),
  tokenUsage: AnalyticsTokenUsageSummarySchema
});

export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>;

export const AnalyticsSnapshotUnavailableSchema = z.object({
  status: z.literal("no_data"),
  message: z.string()
});

export type AnalyticsSnapshotUnavailable = z.infer<
  typeof AnalyticsSnapshotUnavailableSchema
>;

export const AnalyticsSnapshotResponseSchema = z.union([
  MetricSnapshotSchema,
  AnalyticsSnapshotUnavailableSchema
]);

export type AnalyticsSnapshotResponse = z.infer<
  typeof AnalyticsSnapshotResponseSchema
>;

export const MetricDimensionSummarySchema = z.object({
  label: z.string(),
  value: z.number().nonnegative(),
  unit: z.enum(["count", "ratio", "milliseconds", "tokens"]),
  trend: z.enum(["up", "down", "flat"]).optional()
});

export type MetricDimensionSummary = z.infer<
  typeof MetricDimensionSummarySchema
>;

export const MetricSnapshotHistorySchema = z.object({
  snapshots: z.array(MetricSnapshotSchema).max(100),
  latest: MetricSnapshotSchema.optional()
});

export type MetricSnapshotHistory = z.infer<
  typeof MetricSnapshotHistorySchema
>;

export interface MetricListener {
  onMetricSnapshot(snapshot: MetricSnapshot): void;
}

export interface MetricEventEmitter {
  subscribe(listener: MetricListener): () => void;
  getLatestSnapshot(): MetricSnapshot | undefined;
}

export const AlertMetricFieldSchema = z.enum([
  "totalTaskCount",
  "awaitingApproval",
  "recoveryRequired",
  "errorRate",
  "avgApprovalLatencyMs"
]);

export const AlertOperatorSchema = z.enum(["gt", "gte", "lt", "lte", "eq"]);

export const NotificationChannelSchema = z.enum(["in-app", "webhook"]);

export const AlertRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().default(true),
  metricField: AlertMetricFieldSchema,
  operator: AlertOperatorSchema,
  threshold: z.number(),
  suppressionWindowMs: z.number().int().positive().default(300000),
  notificationChannels: z.array(NotificationChannelSchema).default(["in-app"])
});

export type AlertMetricField = z.infer<typeof AlertMetricFieldSchema>;
export type AlertOperator = z.infer<typeof AlertOperatorSchema>;
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const AlertRuleConfigSchema = z.object({
  rules: z.array(AlertRuleSchema),
  webhookUrl: z.string().url().optional()
});

export type AlertRuleConfig = z.infer<typeof AlertRuleConfigSchema>;

export const AlertStateSchema = z.object({
  ruleId: z.string(),
  status: z.enum(["ok", "firing", "suppressed", "resolved"]),
  triggeredAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
  lastSuppressedAt: z.string().datetime().optional(),
  currentValue: z.number(),
  threshold: z.number()
});

export type AlertState = z.infer<typeof AlertStateSchema>;

export const AlertStatesResponseSchema = z.object({
  states: z.array(AlertStateSchema)
});

export type AlertStatesResponse = z.infer<typeof AlertStatesResponseSchema>;

export const AlertEventSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  status: z.enum(["firing", "resolved"]),
  message: z.string(),
  metricValue: z.number(),
  threshold: z.number(),
  timestamp: z.string().datetime()
});

export type AlertEvent = z.infer<typeof AlertEventSchema>;

export const PendingAlertsResponseSchema = z.object({
  alerts: z.array(AlertEventSchema)
});

export type PendingAlertsResponse = z.infer<typeof PendingAlertsResponseSchema>;

export const WebhookPayloadSchema = z.object({
  text: z.string(),
  attachments: z
    .array(
      z.object({
        color: z.enum(["danger", "good", "warning"]),
        title: z.string(),
        fields: z.array(
          z.object({
            title: z.string(),
            value: z.string(),
            short: z.boolean().default(true)
          })
        ),
        footer: z.string().optional()
      })
    )
    .optional()
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export const AuditTrailQuerySchema = z.object({
  taskId: z.string().optional(),
  agentId: z.string().optional(),
  eventType: z.string().optional(),
  timeRange: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime()
    })
    .optional(),
  searchQuery: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  cursor: z.number().int().nonnegative().optional()
});

export type AuditTrailQuery = z.infer<typeof AuditTrailQuerySchema>;

export const AuditTrailEntrySchema = z.object({
  eventId: z.number().int().nonnegative(),
  streamType: z.string(),
  streamId: z.string(),
  eventType: z.string(),
  occurredAt: z.string().datetime(),
  payloadSummary: z.string(),
  actorType: z.string().nullable(),
  actorId: z.string().nullable()
});

export type AuditTrailEntry = z.infer<typeof AuditTrailEntrySchema>;

export const AuditTrailResponseSchema = z.object({
  entries: z.array(AuditTrailEntrySchema),
  nextCursor: z.number().int().nonnegative().optional(),
  totalCount: z.number().int().nonnegative()
});

export type AuditTrailResponse = z.infer<typeof AuditTrailResponseSchema>;

export const AnalyticEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), payload: MetricSnapshotSchema }),
  z.object({ type: z.literal("alert_triggered"), payload: AlertEventSchema }),
  z.object({ type: z.literal("alert_resolved"), payload: AlertEventSchema })
]);

export type AnalyticEvent = z.infer<typeof AnalyticEventSchema>;

export const AnalyticsStreamHeartbeatSchema = z.object({
  type: z.literal("heartbeat"),
  timestamp: z.string().datetime()
});

export type AnalyticsStreamHeartbeat = z.infer<
  typeof AnalyticsStreamHeartbeatSchema
>;
