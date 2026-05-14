/**
 * Task complexity scorer for determining governance depth.
 * Implements the complexity scorecard from the original design.
 */

import type { TaskSpec } from "@feudal/contracts";

export interface ComplexityScore {
  total: number;
  breakdown: {
    codeScope: number;
    dependency: number;
    securitySensitivity: number;
    requirementClarity: number;
    rollbackDifficulty: number;
  };
  level: "L1" | "L2" | "L3";
  governanceDepth: "light" | "standard" | "heavy";
  fastTrackEligible: boolean;
}

export interface ComplexityScorerOptions {
  /** Threshold for L1 (fast-track) */
  l1Threshold?: number;
  /** Threshold for L2 (standard) */
  l2Threshold?: number;
  /** Security-sensitive keywords that force L3 */
  securityKeywords?: string[];
}

const DEFAULT_L1_THRESHOLD = 4;
const DEFAULT_L2_THRESHOLD = 9;
const DEFAULT_SECURITY_KEYWORDS = [
  "auth",
  "password",
  "secret",
  "key",
  "token",
  "payment",
  "billing",
  "permission",
  "admin",
  "delete",
  "drop",
  "truncate"
];

export function scoreTaskComplexity(
  spec: TaskSpec,
  options?: ComplexityScorerOptions
): ComplexityScore {
  const l1Threshold = options?.l1Threshold ?? DEFAULT_L1_THRESHOLD;
  const l2Threshold = options?.l2Threshold ?? DEFAULT_L2_THRESHOLD;
  const securityKeywords = options?.securityKeywords ?? DEFAULT_SECURITY_KEYWORDS;

  // Calculate individual scores
  const codeScope = scoreCodeScope(spec.prompt);
  const dependency = scoreDependency(spec.prompt);
  const securitySensitivity = scoreSecuritySensitivity(spec.prompt, spec.sensitivity, securityKeywords);
  const requirementClarity = scoreRequirementClarity(spec.title, spec.prompt);
  const rollbackDifficulty = scoreRollbackDifficulty(spec.prompt);

  const total = codeScope + dependency + securitySensitivity + requirementClarity + rollbackDifficulty;

  // Determine level
  let level: "L1" | "L2" | "L3";
  let governanceDepth: "light" | "standard" | "heavy";
  let fastTrackEligible: boolean;

  if (securitySensitivity >= 5) {
    // Security-sensitive tasks always go to L3
    level = "L3";
    governanceDepth = "heavy";
    fastTrackEligible = false;
  } else if (total <= l1Threshold) {
    level = "L1";
    governanceDepth = "light";
    fastTrackEligible = true;
  } else if (total <= l2Threshold) {
    level = "L2";
    governanceDepth = "standard";
    fastTrackEligible = false;
  } else {
    level = "L3";
    governanceDepth = "heavy";
    fastTrackEligible = false;
  }

  return {
    total,
    breakdown: {
      codeScope,
      dependency,
      securitySensitivity,
      requirementClarity,
      rollbackDifficulty
    },
    level,
    governanceDepth,
    fastTrackEligible
  };
}

function scoreCodeScope(prompt: string): number {
  const lowerPrompt = prompt.toLowerCase();

  // Check for scope indicators
  if (lowerPrompt.includes("single file") || lowerPrompt.includes("one file")) {
    return 1;
  }
  if (lowerPrompt.includes("multiple files") || lowerPrompt.includes("several files")) {
    return 3;
  }
  if (lowerPrompt.includes("entire project") || lowerPrompt.includes("whole codebase")) {
    return 5;
  }
  if (lowerPrompt.includes("across services") || lowerPrompt.includes("microservice")) {
    return 5;
  }

  // Heuristic based on prompt length and complexity indicators
  const words = prompt.split(/\s+/).length;
  if (words < 20) return 1;
  if (words < 50) return 2;
  if (words < 100) return 3;
  return 4;
}

function scoreDependency(prompt: string): number {
  const lowerPrompt = prompt.toLowerCase();

  // Check for dependency indicators
  const dependencyCount = (
    (lowerPrompt.includes("depend") ? 1 : 0) +
    (lowerPrompt.includes("integrate") ? 1 : 0) +
    (lowerPrompt.includes("api") ? 1 : 0) +
    (lowerPrompt.includes("database") || lowerPrompt.includes("db") ? 1 : 0) +
    (lowerPrompt.includes("external") ? 1 : 0)
  );

  if (dependencyCount === 0) return 0;
  if (dependencyCount <= 2) return 1;
  if (dependencyCount <= 4) return 2;
  return 4;
}

function scoreSecuritySensitivity(
  prompt: string,
  declaredSensitivity: "low" | "medium" | "high",
  securityKeywords: string[]
): number {
  // Declared sensitivity takes precedence
  if (declaredSensitivity === "high") return 5;
  if (declaredSensitivity === "medium") return 2;

  const lowerPrompt = prompt.toLowerCase();

  // Check for security keywords
  for (const keyword of securityKeywords) {
    if (lowerPrompt.includes(keyword)) {
      return 5; // Force L3 for security-sensitive tasks
    }
  }

  return 0;
}

function scoreRequirementClarity(title: string, prompt: string): number {
  // Short, clear prompts score lower
  const titleWords = title.split(/\s+/).length;
  const promptWords = prompt.split(/\s+/).length;

  // Check for clarity indicators
  const hasSpecifics =
    prompt.includes("specifically") ||
    prompt.includes("exactly") ||
    prompt.includes("only") ||
    prompt.includes("just");

  const hasAmbiguity =
    prompt.includes("maybe") ||
    prompt.includes("might") ||
    prompt.includes("could") ||
    prompt.includes("perhaps") ||
    prompt.includes("not sure");

  if (hasAmbiguity) return 4;
  if (hasSpecifics) return 0;
  if (promptWords < 30 && titleWords < 5) return 0;
  if (promptWords < 50) return 1;
  if (promptWords < 100) return 2;
  return 4;
}

function scoreRollbackDifficulty(prompt: string): number {
  const lowerPrompt = prompt.toLowerCase();

  // Check for rollback difficulty indicators
  if (lowerPrompt.includes("migration") || lowerPrompt.includes("migrate")) {
    return 4;
  }
  if (lowerPrompt.includes("delete") || lowerPrompt.includes("remove")) {
    return 2;
  }
  if (lowerPrompt.includes("drop") || lowerPrompt.includes("truncate")) {
    return 4;
  }
  if (lowerPrompt.includes("schema change") || lowerPrompt.includes("alter table")) {
    return 4;
  }
  if (lowerPrompt.includes("refactor")) {
    return 2;
  }

  // Default for new code (easy to rollback)
  if (lowerPrompt.includes("add") || lowerPrompt.includes("create") || lowerPrompt.includes("new")) {
    return 0;
  }

  return 1;
}
