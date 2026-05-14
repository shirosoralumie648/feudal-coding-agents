/**
 * Auto-approval types and schemas for governance decisions.
 * Implements GOV-04: Auto-approval rules based on complexity scoring.
 *
 * Design decisions:
 * - D-08: Auto-approval triggers when complexity score < threshold (default 30)
 * - D-09: Complexity algorithm uses weighted formula: lines, files, dependency depth
 * - D-10: Auto-approved decisions are recorded with full audit trail
 */

import { z } from "zod";

/**
 * Threshold configuration for auto-approval.
 * Defines when auto-approval is triggered for a specific workflow type.
 */
export const AutoApprovalThresholdSchema = z.object({
  id: z.string(),
  workflowType: z.string(), // e.g., 'code-review', 'deployment', 'data-access'
  threshold: z.number().min(0).max(100).default(30),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Input for complexity scoring.
 * Used to calculate the weighted complexity score for auto-approval decisions.
 * Per D-09: weighted formula based on lines, files, dependency depth.
 */
export const ComplexityScoreInputSchema = z.object({
  linesChanged: z.number().min(0),
  filesChanged: z.number().min(0),
  dependencyDepth: z.number().min(0).default(0),
  metadata: z.record(z.string(), z.unknown()).optional(), // Additional context
});

/**
 * Auto-approval decision result.
 * Contains the decision, reason, and applied rule information.
 */
export const AutoApprovalDecisionSchema = z.object({
  decision: z.enum(["approve", "deny", "manual"]),
  reason: z.string(),
  complexityScore: z.number(),
  appliedRule: z.string(), // ID of the threshold rule applied
  timestamp: z.string().datetime(),
});

/**
 * Audit log entry for auto-approval decisions.
 * Per D-10: Complete audit trail for auto-approved decisions.
 */
export const AutoApprovalAuditLogSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  decision: AutoApprovalDecisionSchema,
  thresholdSnapshot: AutoApprovalThresholdSchema,
  complexityInput: ComplexityScoreInputSchema,
  createdAt: z.string().datetime(),
});

// Export TypeScript types
export type AutoApprovalThreshold = z.infer<typeof AutoApprovalThresholdSchema>;
export type ComplexityScoreInput = z.infer<typeof ComplexityScoreInputSchema>;
export type AutoApprovalDecision = z.infer<typeof AutoApprovalDecisionSchema>;
export type AutoApprovalAuditLog = z.infer<typeof AutoApprovalAuditLogSchema>;

/**
 * Configuration for the auto-approval engine.
 * Supports runtime configuration per D-06.
 */
export interface AutoApprovalConfig {
  /** Default threshold for auto-approval (per D-08, default 30) */
  defaultThreshold: number;
  /** Workflow-specific thresholds */
  workflowSpecificThresholds: Map<string, number>;
  /** Scores above this always require manual review */
  denyThreshold: number;
  /** Whether audit logging is enabled (per D-10) */
  auditLogEnabled: boolean;
}

/**
 * Request to create or update an auto-approval threshold.
 */
export const CreateAutoApprovalThresholdRequestSchema = z.object({
  workflowType: z.string().min(1),
  threshold: z.number().min(0).max(100),
  enabled: z.boolean().optional(),
});

/**
 * Request to evaluate a task for auto-approval.
 */
export const EvaluateAutoApprovalRequestSchema = z.object({
  taskId: z.string(),
  workflowType: z.string(),
  complexityInput: ComplexityScoreInputSchema,
});

export type CreateAutoApprovalThresholdRequest = z.infer<
  typeof CreateAutoApprovalThresholdRequestSchema
>;
export type EvaluateAutoApprovalRequest = z.infer<
  typeof EvaluateAutoApprovalRequestSchema
>;
