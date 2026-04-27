/**
 * Rule engine DSL types and schemas for conditional approval rules.
 * Implements GOV-01: Complex conditional approval rule engine.
 *
 * Per D-01: JSON-based DSL for rules, supporting AND/OR/NOT logic combinations.
 * Per D-03: Rule version control uses optimistic lock, creating draft versions on edit.
 */

import { z } from "zod";

// ============================================================================
// Logical Operators
// ============================================================================

/**
 * Logical operators for combining rule conditions.
 * - AND: All conditions must match
 * - OR: At least one condition must match
 * - NOT: Inverts the result of nested conditions
 */
export const RuleOperatorSchema = z.enum(["and", "or", "not"]);

export type RuleOperator = z.infer<typeof RuleOperatorSchema>;

// ============================================================================
// Comparison Operators
// ============================================================================

/**
 * Comparison operators for rule conditions.
 * Supports equality, relational, and string operations.
 */
export const ComparisonOperatorSchema = z.enum([
  "eq",        // equals
  "ne",        // not equals
  "gt",        // greater than
  "lt",        // less than
  "gte",       // greater than or equal
  "lte",       // less than or equal
  "in",        // value in array
  "contains",  // string contains
  "startsWith", // string starts with
  "endsWith"   // string ends with
]);

export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>;

// ============================================================================
// Rule Condition
// ============================================================================

/**
 * A single condition in a rule.
 * Compares a field value against a target value using an operator.
 *
 * Field uses dot-notation for nested properties:
 * - "complexity.total" -> task.complexity.total
 * - "sensitivity" -> task.sensitivity
 */
export const RuleConditionSchema = z.object({
  field: z.string().min(1).max(200).describe(
    "Dot-notation path to the field to compare (e.g., 'complexity.total', 'sensitivity')"
  ),
  operator: ComparisonOperatorSchema.describe(
    "Comparison operator to use"
  ),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number())
  ]).describe(
    "Value to compare against (type depends on operator and field)"
  )
});

export type RuleCondition = z.infer<typeof RuleConditionSchema>;

// ============================================================================
// Composite Rule (Recursive)
// ============================================================================

/**
 * Composite rule that combines multiple conditions with logical operators.
 * Supports recursive nesting for complex rule trees.
 *
 * Example: (complexity.total > 5 AND sensitivity = "high") OR hasSecurityKeywords = true
 */
export interface CompositeRule {
  operator: RuleOperator;
  rules: Array<RuleCondition | CompositeRule>;
}

export const CompositeRuleSchema: z.ZodType<CompositeRule> = z.lazy(() =>
  z.object({
    operator: RuleOperatorSchema.describe(
      "Logical operator to combine the rules"
    ),
    rules: z.array(
      z.union([
        RuleConditionSchema,
        CompositeRuleSchema
      ])
    ).min(1).max(100).describe(
      "Child rules or conditions to combine (max 100 to prevent DoS)"
    )
  })
);

// ============================================================================
// Rule Actions
// ============================================================================

/**
 * Types of actions a rule can trigger.
 * - require_approval: Route to human approval queue
 * - auto_approve: Automatically approve the task
 * - auto_reject: Automatically reject the task
 * - escalate: Escalate to higher authority
 */
export const RuleActionTypeSchema = z.enum([
  "require_approval",
  "auto_approve",
  "auto_reject",
  "escalate"
]);

export type RuleActionType = z.infer<typeof RuleActionTypeSchema>;

/**
 * Action configuration for a rule.
 */
export const RuleActionSchema = z.object({
  type: RuleActionTypeSchema.describe(
    "Type of action to take when rule matches"
  ),
  approvers: z.array(z.string()).optional().describe(
    "List of approver IDs or roles for require_approval action"
  ),
  escalationTarget: z.string().optional().describe(
    "Target role or user for escalate action"
  ),
  reason: z.string().max(1000).optional().describe(
    "Reason for the action (included in audit log)"
  )
});

export type RuleAction = z.infer<typeof RuleActionSchema>;

// ============================================================================
// Rule Version Status
// ============================================================================

/**
 * Status of a rule version.
 * - draft: Work in progress, not active
 * - published: Active and being evaluated
 * - archived: No longer active, kept for history
 */
export const RuleVersionStatusSchema = z.enum([
  "draft",
  "published",
  "archived"
]);

export type RuleVersionStatus = z.infer<typeof RuleVersionStatusSchema>;

// ============================================================================
// Approval Rule
// ============================================================================

/**
 * Complete approval rule definition.
 * A rule consists of conditions to evaluate and actions to take when matched.
 *
 * Rules are versioned for audit trail and can be enabled/disabled.
 * Per D-03: Version control uses optimistic locking.
 */
export const ApprovalRuleSchema = z.object({
  id: z.string().uuid().describe(
    "Unique identifier for the rule"
  ),
  name: z.string().min(1).max(200).describe(
    "Human-readable name for the rule"
  ),
  description: z.string().max(1000).optional().describe(
    "Detailed description of what the rule does"
  ),
  version: z.number().int().positive().default(1).describe(
    "Version number for optimistic locking"
  ),
  versionStatus: RuleVersionStatusSchema.default("draft").describe(
    "Current status of this rule version"
  ),
  conditions: z.union([
    RuleConditionSchema,
    CompositeRuleSchema
  ]).describe(
    "Conditions to evaluate (single condition or composite)"
  ),
  actions: RuleActionSchema.describe(
    "Action to take when rule matches"
  ),
  priority: z.number().int().min(0).max(1000).default(500).describe(
    "Priority for rule evaluation order (higher = evaluated first)"
  ),
  enabled: z.boolean().default(true).describe(
    "Whether the rule is active"
  ),
  createdAt: z.string().datetime().describe(
    "ISO 8601 timestamp when rule was created"
  ),
  updatedAt: z.string().datetime().describe(
    "ISO 8601 timestamp when rule was last updated"
  ),
  createdBy: z.string().optional().describe(
    "ID of user or system that created the rule"
  )
});

export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;

// ============================================================================
// Rule List and Query Types
// ============================================================================

/**
 * Rule creation request.
 */
export const CreateApprovalRuleSchema = ApprovalRuleSchema.omit({
  id: true,
  version: true,
  versionStatus: true,
  createdAt: true,
  updatedAt: true
});

export type CreateApprovalRule = z.infer<typeof CreateApprovalRuleSchema>;

/**
 * Rule update request.
 */
export const UpdateApprovalRuleSchema = ApprovalRuleSchema.partial().required({
  id: true,
  version: true // Required for optimistic locking
});

export type UpdateApprovalRule = z.infer<typeof UpdateApprovalRuleSchema>;

/**
 * Query parameters for listing rules.
 */
export const RuleListQuerySchema = z.object({
  status: RuleVersionStatusSchema.optional(),
  enabled: z.boolean().optional(),
  createdBy: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});

export type RuleListQuery = z.infer<typeof RuleListQuerySchema>;

/**
 * Paginated list of rules.
 */
export const RuleListSchema = z.object({
  rules: z.array(ApprovalRuleSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative()
});

export type RuleList = z.infer<typeof RuleListSchema>;
