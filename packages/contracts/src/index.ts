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
  "rolled_back"
]);

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
  createdAt: z.string(),
  updatedAt: z.string()
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskSpec = z.infer<typeof TaskSpecSchema>;
export type TaskArtifact = z.infer<typeof TaskArtifactSchema>;
export type ACPRunSummaryStatus = z.infer<typeof ACPRunSummaryStatusSchema>;
export type ACPRunSummaryPhase = z.infer<typeof ACPRunSummaryPhaseSchema>;
export type ACPRunSummary = z.infer<typeof ACPRunSummarySchema>;
export type TaskApprovalRequest = z.infer<typeof TaskApprovalRequestSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
