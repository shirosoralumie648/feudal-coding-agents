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
  "abandoned",
  "rejected",
  "failed",
  "rolled_back"
]);

export const WorkflowPhaseSchema = z.enum([
  "intake",
  "planning",
  "review",
  "approval",
  "execution",
  "verification",
  "revision",
  "recovery",
  "completed",
  "terminal"
]);

export const TaskActionSchema = z.enum(["approve", "reject", "revise"]);
export const OperatorActionTypeSchema = z.enum(["recover", "takeover", "abandon"]);
export const OperatorActionStatusSchema = z.enum([
  "requested",
  "applied",
  "rejected"
]);
const OperatorActionNoteSchema = z.string().trim().min(1);
export const OperatorActionRequestSchema = z.object({
  actionType: OperatorActionTypeSchema,
  note: OperatorActionNoteSchema,
  confirm: z.boolean().optional()
});
export const RecoveryStateSchema = z.enum([
  "healthy",
  "replaying",
  "recovery_required"
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
    "fact-check",
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

const OperatorActionRecordBaseSchema = z.object({
  id: z.number().int().nonnegative(),
  taskId: z.string(),
  actionType: OperatorActionTypeSchema,
  note: OperatorActionNoteSchema,
  actorType: z.string(),
  actorId: z.string().optional(),
  createdAt: z.string()
});

export const OperatorActionRecordSchema = z.discriminatedUnion("status", [
  OperatorActionRecordBaseSchema.extend({
    status: z.literal("requested")
  }),
  OperatorActionRecordBaseSchema.extend({
    status: z.literal("applied"),
    appliedAt: z.string()
  }),
  OperatorActionRecordBaseSchema.extend({
    status: z.literal("rejected"),
    rejectedAt: z.string(),
    rejectionReason: z.string()
  })
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
      operatorAllowedActions: z.array(OperatorActionTypeSchema)
    })
  )
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
  allowedActions: z.array(z.string()).optional(),
  cancellationReason: z.string().optional()
});

export const TaskApprovalRequestSchema = z.object({
  runId: z.string(),
  prompt: z.string(),
  actions: z.array(z.string())
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

export const TaskRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  workflowPhase: WorkflowPhaseSchema.optional(),
  artifacts: z.array(TaskArtifactSchema),
  history: z.array(TaskHistoryEntrySchema),
  runIds: z.array(z.string()),
  approvalRunId: z.string().optional(),
  runs: z.array(ACPRunSummarySchema).default([]),
  approvalRequest: TaskApprovalRequestSchema.optional(),
  governance: TaskGovernanceSchema.optional(),
  operatorAllowedActions: z.array(OperatorActionTypeSchema).default([]),
  revisionRequest: TaskRevisionRequestSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const TaskProjectionSchema = TaskRecordSchema.extend({
  recoveryState: RecoveryStateSchema,
  recoveryReason: z.string().optional(),
  lastRecoveredAt: z.string().optional(),
  latestEventId: z.number().int().nonnegative(),
  latestProjectionVersion: z.number().int().nonnegative()
});

const RunProjectionMessageSchema = z.object({
  role: z.union([z.literal("user"), z.string().regex(/^agent\/.+/)]),
  content: z.string()
});

const RunProjectionArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  content: z.unknown()
});

export const RunProjectionSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  agent: z.string(),
  status: ACPRunSummaryStatusSchema,
  phase: ACPRunSummaryPhaseSchema.optional(),
  messages: z.array(RunProjectionMessageSchema),
  artifacts: z.array(RunProjectionArtifactSchema),
  awaitPrompt: z.string().optional(),
  allowedActions: z.array(z.string()).optional(),
  cancellationReason: z.string().optional(),
  recoveryState: RecoveryStateSchema,
  recoveryReason: z.string().optional(),
  lastRecoveredAt: z.string().optional(),
  latestEventId: z.number().int().nonnegative(),
  latestProjectionVersion: z.number().int().nonnegative()
});

const RecoveryBreakdownSchema = z.object({
  healthy: z.number().int().nonnegative(),
  replaying: z.number().int().nonnegative(),
  recoveryRequired: z.number().int().nonnegative()
});

const RunStatusBreakdownSchema = z.object({
  created: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  awaiting: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelling: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative()
});

export const RecoverySummarySchema = z.object({
  tasksNeedingRecovery: z.number().int().nonnegative(),
  runsNeedingRecovery: z.number().int().nonnegative(),
  taskBreakdown: RecoveryBreakdownSchema,
  runRecoveryBreakdown: RecoveryBreakdownSchema,
  runStatusBreakdown: RunStatusBreakdownSchema
});

// Token usage tracking
export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});

export const RunTokenUsageSchema = z.object({
  runId: z.string(),
  agent: z.string(),
  phase: ACPRunSummaryPhaseSchema,
  tokenUsage: TokenUsageSchema,
  recordedAt: z.string()
});

export const TaskTokenUsageSummarySchema = z.object({
  taskId: z.string(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  runs: z.array(RunTokenUsageSchema)
});

export const SystemTokenUsageSummarySchema = z.object({
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  byAgent: z.array(z.object({
    agent: z.string(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    runCount: z.number().int().nonnegative()
  }))
});

// Governance types (RBAC)
export * from "./governance/index";
export * from "./analytics";

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;
export type TaskAction = z.infer<typeof TaskActionSchema>;
export type OperatorActionType = z.infer<typeof OperatorActionTypeSchema>;
export type OperatorActionStatus = z.infer<typeof OperatorActionStatusSchema>;
export type OperatorActionRequest = z.infer<typeof OperatorActionRequestSchema>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;
export type GovernanceExecutionMode = z.infer<typeof GovernanceExecutionModeSchema>;
export type TaskGovernance = z.infer<typeof TaskGovernanceSchema>;
export type TaskRevisionRequest = z.infer<typeof TaskRevisionRequestSchema>;
export type TaskSpec = z.infer<typeof TaskSpecSchema>;
export type TaskArtifact = z.infer<typeof TaskArtifactSchema>;
export type OperatorActionRecord = z.infer<typeof OperatorActionRecordSchema>;
export type OperatorActionSummary = z.infer<typeof OperatorActionSummarySchema>;
export type ACPRunSummaryStatus = z.infer<typeof ACPRunSummaryStatusSchema>;
export type ACPRunSummaryPhase = z.infer<typeof ACPRunSummaryPhaseSchema>;
export type ACPRunSummary = z.infer<typeof ACPRunSummarySchema>;
export type TaskApprovalRequest = z.infer<typeof TaskApprovalRequestSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type RecoveryState = z.infer<typeof RecoveryStateSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type TaskProjection = z.infer<typeof TaskProjectionSchema>;
export type RunProjection = z.infer<typeof RunProjectionSchema>;
export type RecoverySummary = z.infer<typeof RecoverySummarySchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type RunTokenUsage = z.infer<typeof RunTokenUsageSchema>;
export type TaskTokenUsageSummary = z.infer<typeof TaskTokenUsageSummarySchema>;
export type SystemTokenUsageSummary = z.infer<typeof SystemTokenUsageSummarySchema>;

export function deriveWorkflowPhase(task: {
  status: TaskStatus;
  recoveryState?: RecoveryState;
}): WorkflowPhase {
  if (task.recoveryState && task.recoveryState !== "healthy") {
    return "recovery";
  }

  switch (task.status) {
    case "draft":
    case "intake":
      return "intake";
    case "planning":
      return "planning";
    case "review":
      return "review";
    case "awaiting_approval":
      return "approval";
    case "dispatching":
    case "executing":
      return "execution";
    case "verifying":
      return "verification";
    case "needs_revision":
      return "revision";
    case "failed":
      return "recovery";
    case "completed":
      return "completed";
    case "abandoned":
    case "rejected":
    case "partial_success":
    case "rolled_back":
      return "terminal";
  }
}
