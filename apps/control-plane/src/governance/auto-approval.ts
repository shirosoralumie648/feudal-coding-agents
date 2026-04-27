/**
 * Auto-approval engine for governance decisions.
 * Implements GOV-04: Auto-approval rules based on complexity scoring.
 *
 * Design decisions:
 * - D-08: Auto-approval triggers when complexity score < threshold (default 30)
 * - D-09: Complexity algorithm uses weighted formula: lines, files, dependency depth
 * - D-10: Auto-approved decisions are recorded with full audit trail
 */

import type {
  AutoApprovalConfig,
  AutoApprovalDecision,
  AutoApprovalThreshold,
  ComplexityScoreInput,
  AutoApprovalAuditLog,
} from "@feudal/contracts/governance";
import type { EventStore } from "@feudal/persistence";

export interface AutoApprovalEngineOptions {
  config: AutoApprovalConfig;
  eventStore: EventStore;
  getThresholdForWorkflow: (workflowType: string) => Promise<AutoApprovalThreshold | null>;
}

/**
 * Auto-approval engine that evaluates tasks based on complexity scores.
 * Supports workflow-specific thresholds and complete audit logging.
 */
export class AutoApprovalEngine {
  private config: AutoApprovalConfig;
  private eventStore: EventStore;
  private getThresholdForWorkflow: (workflowType: string) => Promise<AutoApprovalThreshold | null>;

  constructor(options: AutoApprovalEngineOptions) {
    this.config = options.config;
    this.eventStore = options.eventStore;
    this.getThresholdForWorkflow = options.getThresholdForWorkflow;
  }

  /**
   * Evaluate a task for auto-approval based on complexity score.
   * Implements D-08: Auto-approve when complexity < threshold.
   */
  async evaluate(
    taskId: string,
    workflowType: string,
    complexityInput: ComplexityScoreInput,
    calculatedScore: number,
  ): Promise<AutoApprovalDecision> {
    // Get threshold for this workflow type
    const threshold = await this.getThresholdForWorkflow(workflowType);
    const effectiveThreshold = threshold?.threshold ?? this.config.defaultThreshold;
    const isEnabled = threshold?.enabled ?? true;

    // If auto-approval is disabled for this workflow, always require manual review
    if (!isEnabled) {
      return this.createDecision(
        "manual",
        "Auto-approval disabled for this workflow type",
        calculatedScore,
        threshold?.id ?? "default",
      );
    }

    // D-08: Auto-approve when score < threshold
    if (calculatedScore < effectiveThreshold) {
      const decision = this.createDecision(
        "approve",
        `Complexity score ${calculatedScore} below threshold ${effectiveThreshold}`,
        calculatedScore,
        threshold?.id ?? "default",
      );
      await this.logDecision(taskId, decision, threshold, complexityInput);
      return decision;
    }

    // D-08 variant: High complexity always requires manual review
    if (calculatedScore > this.config.denyThreshold) {
      return this.createDecision(
        "manual",
        `Complexity score ${calculatedScore} exceeds maximum auto-approval threshold ${this.config.denyThreshold}`,
        calculatedScore,
        threshold?.id ?? "default",
      );
    }

    // Score is between threshold and denyThreshold - manual review required
    return this.createDecision(
      "manual",
      `Complexity score ${calculatedScore} requires manual review (threshold: ${effectiveThreshold}, max: ${this.config.denyThreshold})`,
      calculatedScore,
      threshold?.id ?? "default",
    );
  }

  private createDecision(
    decision: "approve" | "deny" | "manual",
    reason: string,
    complexityScore: number,
    appliedRule: string,
  ): AutoApprovalDecision {
    return {
      decision,
      reason,
      complexityScore,
      appliedRule,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log auto-approval decision to event store for audit trail.
   * Implements D-10: Complete audit log marked as 'auto-approved' type.
   */
  private async logDecision(
    taskId: string,
    decision: AutoApprovalDecision,
    threshold: AutoApprovalThreshold | null,
    complexityInput: ComplexityScoreInput,
  ): Promise<void> {
    if (!this.config.auditLogEnabled) {
      return;
    }

    const auditLog: AutoApprovalAuditLog = {
      id: crypto.randomUUID(),
      taskId,
      decision,
      thresholdSnapshot: threshold ?? {
        id: "default",
        workflowType: "default",
        threshold: this.config.defaultThreshold,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      complexityInput,
      createdAt: new Date().toISOString(),
    };

    // D-10: Write to event store with 'auto-approved' event type
    await this.eventStore.append(`auto-approval:${taskId}`, {
      type: "auto-approved",
      payload: auditLog,
      metadata: {
        timestamp: new Date().toISOString(),
        source: "auto-approval-engine",
        version: "1.0.0",
      },
    });
  }

  /**
   * Get current configuration.
   */
  getConfig(): AutoApprovalConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(updates: Partial<AutoApprovalConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Factory function for creating engine instances
export interface CreateAutoApprovalEngineOptions {
  defaultThreshold?: number;
  denyThreshold?: number;
  auditLogEnabled?: boolean;
  eventStore: EventStore;
  getThresholdForWorkflow: (workflowType: string) => Promise<AutoApprovalThreshold | null>;
}

export async function createAutoApprovalEngine(
  options: CreateAutoApprovalEngineOptions,
): Promise<AutoApprovalEngine> {
  const config: AutoApprovalConfig = {
    defaultThreshold: options.defaultThreshold ?? 30,
    denyThreshold: options.denyThreshold ?? 70,
    workflowSpecificThresholds: new Map(),
    auditLogEnabled: options.auditLogEnabled ?? true,
  };

  return new AutoApprovalEngine({
    config,
    eventStore: options.eventStore,
    getThresholdForWorkflow: options.getThresholdForWorkflow,
  });
}
