import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "draft",
  "intake",
  "planning",
  "review",
  "awaiting_approval",
  "dispatching",
  "executing",
  "verifying",
  "completed",
  "needs_revision",
  "partial_success",
  "rejected",
  "failed",
  "rolled_back",
  "abandoned"
]);

export const TaskActionSchema = z.enum(["approve", "reject", "revise"]);

export const OperatorActionTypeSchema = z.enum([
  "recover",
  "takeover",
  "abandon"
]);

export const OperatorActionStatusSchema = z.enum([
  "requested",
  "applied",
  "rejected"
]);

export const ReviewVerdictSchema = z.enum([
  "pending",
  "approved",
  "needs_revision",
  "rejected"
]);

export const GovernanceExecutionModeSchema = z.enum([
  "real",
  "real_with_mock_fallback",
  "mock_fallback_used"
]);

export const TaskGovernanceSchema = z.object({
  requestedRequiresApproval: z.boolean(),
  effectiveRequiresApproval: z.boolean(),
  allowMock: z.boolean(),
  sensitivity: z.enum(["low", "medium", "high"]),
  executionMode: GovernanceExecutionModeSchema,
  policyReasons: z.array(z.string()).default([]),
  reviewVerdict: ReviewVerdictSchema,
  allowedActions: z.array(TaskActionSchema).default([]),
  revisionCount: z.number().int().nonnegative().default(0)
});

export const TaskRevisionRequestSchema = z.object({
  note: z.string().min(1),
  reviewerReasons: z.array(z.string()).default([]),
  createdAt: z.string()
});

export const TaskArtifactSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "taskspec",
    "decision-brief",
    "review",
    "assignment",
    "execution-report"
  ]),
  name: z.string(),
  mimeType: z.string(),
  content: z.unknown()
});

export const TaskHistoryEntrySchema = z.object({
  status: TaskStatusSchema,
  at: z.string(),
  note: z.string()
});

export const TaskSpecSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  prompt: z.string().min(1),
  allowMock: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  sensitivity: z.enum(["low", "medium", "high"]).default("medium")
});

export const ACPRunSummaryStatusSchema = z.enum([
  "created",
  "in-progress",
  "awaiting",
  "completed",
  "failed",
  "cancelling",
  "cancelled"
]);

export const ACPRunSummaryPhaseSchema = z.enum([
  "intake",
  "planning",
  "review",
  "approval",
  "execution",
  "verification"
]);

export const ACPRunSummarySchema = z.object({
  id: z.string(),
  agent: z.string(),
  status: ACPRunSummaryStatusSchema,
  phase: ACPRunSummaryPhaseSchema,
  awaitPrompt: z.string().optional(),
  allowedActions: z.array(z.string()).optional()
});

export const TaskApprovalRequestSchema = z.object({
  runId: z.string(),
  prompt: z.string(),
  actions: z.array(z.string())
});

export const OperatorActionRequestSchema = z.object({
  note: z.string().trim().min(1),
  confirm: z.literal(true).optional()
});

export const OperatorActionRecordSchema = z.object({
  id: z.number().int().nonnegative(),
  taskId: z.string(),
  actionType: OperatorActionTypeSchema,
  status: OperatorActionStatusSchema,
  note: z.string().min(1),
  actorType: z.string(),
  actorId: z.string().optional(),
  createdAt: z.string(),
  appliedAt: z.string().optional(),
  rejectedAt: z.string().optional(),
  rejectionReason: z.string().optional()
});

export const AuditEventSchema = z.object({
  id: z.number(),
  streamType: z.string(),
  streamId: z.string(),
  eventType: z.string(),
  eventVersion: z.number(),
  occurredAt: z.string(),
  payloadJson: z.record(z.string(), z.unknown()),
  metadataJson: z.record(z.string(), z.unknown())
});

export const RecoveryStateSchema = z.enum([
  "healthy",
  "replaying",
  "recovery_required"
]);

export const OperatorActionSummarySchema = z.object({
  tasksNeedingOperatorAttention: z.number().int().nonnegative(),
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: TaskStatusSchema,
      recoveryState: RecoveryStateSchema,
      recoveryReason: z.string().optional(),
      operatorAllowedActions: z.array(OperatorActionTypeSchema).default([])
    })
  )
});

export const TaskRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  artifacts: z.array(TaskArtifactSchema),
  history: z.array(TaskHistoryEntrySchema),
  runIds: z.array(z.string()),
  approvalRunId: z.string().optional(),
  runs: z.array(ACPRunSummarySchema).default([]),
  approvalRequest: TaskApprovalRequestSchema.optional(),
  governance: TaskGovernanceSchema.optional(),
  revisionRequest: TaskRevisionRequestSchema.optional(),
  operatorAllowedActions: z.array(OperatorActionTypeSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskAction = z.infer<typeof TaskActionSchema>;
export type OperatorActionType = z.infer<typeof OperatorActionTypeSchema>;
export type OperatorActionStatus = z.infer<typeof OperatorActionStatusSchema>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type GovernanceExecutionMode = z.infer<typeof GovernanceExecutionModeSchema>;
export type TaskGovernance = z.infer<typeof TaskGovernanceSchema>;
export type TaskRevisionRequest = z.infer<typeof TaskRevisionRequestSchema>;
export type TaskSpec = z.infer<typeof TaskSpecSchema>;
export type TaskArtifact = z.infer<typeof TaskArtifactSchema>;
export type ACPRunSummaryStatus = z.infer<typeof ACPRunSummaryStatusSchema>;
export type ACPRunSummaryPhase = z.infer<typeof ACPRunSummaryPhaseSchema>;
export type ACPRunSummary = z.infer<typeof ACPRunSummarySchema>;
export type TaskApprovalRequest = z.infer<typeof TaskApprovalRequestSchema>;
export type OperatorActionRequest = z.infer<typeof OperatorActionRequestSchema>;
export type OperatorActionRecord = z.infer<typeof OperatorActionRecordSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type RecoveryState = z.infer<typeof RecoveryStateSchema>;
export type OperatorActionSummary = z.infer<typeof OperatorActionSummarySchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
