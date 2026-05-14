/**
 * Runtime types for rule engine evaluation.
 * These types are used by the control-plane to evaluate rules
 * against task context and produce results.
 */

import type {
  TaskStatus,
  ApprovalRule,
  RuleActionType
} from "@feudal/contracts";

// ============================================================================
// Evaluation Context
// ============================================================================

/**
 * Context provided to the rule engine for evaluation.
 * Contains all task properties that rules can reference.
 *
 * This matches the field paths supported in RuleCondition.field.
 */
export interface RuleEvaluationContext {
  /** Task ID being evaluated */
  taskId: string;

  // Complexity fields (from complexity-scorer.ts)
  /** Total complexity score */
  complexityScore: number;
  /** Complexity level (L1=fast-track, L2=standard, L3=heavy) */
  complexityLevel: "L1" | "L2" | "L3";
  /** Governance depth derived from complexity */
  governanceDepth: "light" | "standard" | "heavy";

  // Task properties
  /** Task sensitivity level */
  sensitivity: "low" | "medium" | "high";
  /** Current task status */
  status: TaskStatus;

  // Governance state
  /** Number of times task has been revised */
  revisionCount: number;
  /** Whether task contains security-sensitive keywords */
  hasSecurityKeywords: boolean;
  /** Whether task is eligible for fast-track (auto-approve) */
  fastTrackEligible: boolean;

  // Optional context
  /** Estimated lines of code affected */
  estimatedLineCount?: number;
  /** List of affected files */
  affectedFiles?: string[];
  /** Tags assigned to the task */
  tags?: string[];
  /** Prompt length in characters */
  promptLength?: number;
  /** Title of the task */
  title?: string;
}

// ============================================================================
// Evaluation Result
// ============================================================================

/**
 * Result of evaluating a rule against a context.
 * Returned when a rule matches, null if no rules match.
 */
export interface RuleEvaluationResult {
  /** Whether the rule matched the context */
  matched: boolean;

  /** ID of the rule that matched */
  ruleId: string;

  /** Name of the rule that matched */
  ruleName: string;

  /** Action to take based on the rule */
  action: RuleActionType;

  /** Priority of the matched rule */
  priority: number;

  /** Reason for the action (from rule definition) */
  reason: string;

  /** Human-readable descriptions of matched conditions */
  matchedConditions: string[];

  /** Approver IDs if action is require_approval */
  approvers?: string[];

  /** Escalation target if action is escalate */
  escalationTarget?: string;
}

// ============================================================================
// Rule Engine Interface
// ============================================================================

/**
 * Result of comparing two rule versions.
 */
export interface RuleDiff {
  /** Type of change */
  type: "added" | "removed" | "modified" | "unchanged";
  /** Path to the changed field (dot-notation) */
  path: string;
  /** Previous value */
  oldValue: unknown;
  /** New value */
  newValue: unknown;
}

/**
 * Rule engine interface.
 * Implementations evaluate rules against task context.
 */
export interface RuleEngine {
  /**
   * Evaluate all enabled rules against the given context.
   * Returns the first matching rule (highest priority), or null if no match.
   */
  evaluate(context: RuleEvaluationContext): Promise<RuleEvaluationResult | null>;

  /**
   * Evaluate all matching rules and return all results.
   * Useful for debugging and multi-rule scenarios.
   */
  evaluateAll(context: RuleEvaluationContext): Promise<RuleEvaluationResult[]>;

  /**
   * Validate a rule definition.
   * Returns ok if valid, error with field path if invalid.
   */
  validateRule(rule: ApprovalRule): Result<void, RuleValidationError>;

  /**
   * Compare two rule versions and return the diff.
   */
  compareVersions(v1: ApprovalRule, v2: ApprovalRule): RuleDiff[];
}

// ============================================================================
// Result Type
// ============================================================================

/**
 * Result type for operations that can fail.
 * Follows the Result pattern from CONVENTIONS.md.
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when rule validation fails.
 * Includes field path for precise error reporting.
 */
export class RuleValidationError extends Error {
  /** Dot-notation path to the invalid field */
  public readonly field: string;

  constructor(message: string, field: string = "") {
    super(message);
    this.name = "RuleValidationError";
    this.field = field;
  }
}

/**
 * Error thrown when rule version conflict occurs.
 * Per D-03: Used for optimistic locking failures.
 */
export class RuleVersionConflictError extends Error {
  /** ID of the rule with version conflict */
  public readonly ruleId: string;
  /** Expected version number */
  public readonly expectedVersion: number;
  /** Actual version number in storage */
  public readonly actualVersion: number;

  constructor(
    ruleId: string,
    expectedVersion: number,
    actualVersion: number
  ) {
    super(
      `Rule version conflict: expected ${expectedVersion}, actual ${actualVersion}`
    );
    this.name = "RuleVersionConflictError";
    this.ruleId = ruleId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Error thrown when rule evaluation fails.
 */
export class RuleEvaluationError extends Error {
  /** ID of the rule that failed */
  public readonly ruleId?: string;
  /** Field that caused the error */
  public readonly field?: string;

  constructor(message: string, ruleId?: string, field?: string) {
    super(message);
    this.name = "RuleEvaluationError";
    this.ruleId = ruleId;
    this.field = field;
  }
}

// ============================================================================
// Rule Statistics
// ============================================================================

/**
 * Statistics about rule evaluation.
 */
export interface RuleStatistics {
  /** Total number of rules */
  totalRules: number;
  /** Number of enabled rules */
  enabledRules: number;
  /** Number of rules by action type */
  byAction: Record<RuleActionType, number>;
  /** Average evaluation time in milliseconds */
  avgEvaluationTimeMs: number;
  /** Number of evaluations in the last hour */
  evaluationsLastHour: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
}
