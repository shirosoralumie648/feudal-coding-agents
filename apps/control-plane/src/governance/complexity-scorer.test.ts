import { describe, expect, it } from "vitest";
import { scoreTaskComplexity } from "./complexity-scorer";
import type { TaskSpec } from "@feudal/contracts";

describe("complexity scorer", () => {
  describe("scoreTaskComplexity", () => {
    it("scores simple tasks as L1", () => {
      const spec: TaskSpec = {
        id: "task-1",
        title: "Fix typo",
        prompt: "Fix the typo in the README file",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "low"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.level).toBe("L1");
      expect(result.governanceDepth).toBe("light");
      expect(result.fastTrackEligible).toBe(true);
    });

    it("scores medium complexity tasks as L2", () => {
      const spec: TaskSpec = {
        id: "task-2",
        title: "Add new API endpoint with database integration",
        prompt: "Create a new REST API endpoint for user profile management with database integration. This task involves multiple files and external dependencies. The implementation should handle authentication and authorization properly.",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.level).toBe("L2");
      expect(result.governanceDepth).toBe("standard");
      expect(result.fastTrackEligible).toBe(false);
    });

    it("forces L3 for security-sensitive tasks", () => {
      const spec: TaskSpec = {
        id: "task-3",
        title: "Update password handling",
        prompt: "Update the password hashing algorithm",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "low"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.level).toBe("L3");
      expect(result.governanceDepth).toBe("heavy");
      expect(result.fastTrackEligible).toBe(false);
    });

    it("forces L3 for declared high sensitivity", () => {
      const spec: TaskSpec = {
        id: "task-4",
        title: "Simple change",
        prompt: "Change a simple thing",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "high"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.level).toBe("L3");
      expect(result.breakdown.securitySensitivity).toBe(5);
    });

    it("scores database migrations as high complexity", () => {
      const spec: TaskSpec = {
        id: "task-5",
        title: "Database migration",
        prompt: "Create a migration to add a new column to the users table",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.breakdown.rollbackDifficulty).toBe(4);
    });

    it("scores cross-service changes as high complexity", () => {
      const spec: TaskSpec = {
        id: "task-6",
        title: "Cross-service refactor",
        prompt: "Refactor the authentication flow across all microservices",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.breakdown.codeScope).toBe(5);
    });

    it("provides breakdown of all scores", () => {
      const spec: TaskSpec = {
        id: "task-7",
        title: "Test task",
        prompt: "A test prompt for scoring",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "low"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.breakdown).toHaveProperty("codeScope");
      expect(result.breakdown).toHaveProperty("dependency");
      expect(result.breakdown).toHaveProperty("securitySensitivity");
      expect(result.breakdown).toHaveProperty("requirementClarity");
      expect(result.breakdown).toHaveProperty("rollbackDifficulty");
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it("respects custom thresholds", () => {
      const spec: TaskSpec = {
        id: "task-8",
        title: "Simple task",
        prompt: "Do something simple",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "low"
      };

      const result = scoreTaskComplexity(spec, { l1Threshold: 10 });

      // With higher threshold, more tasks qualify for L1
      expect(result.level).toBe("L1");
    });

    it("detects payment-related tasks as security-sensitive", () => {
      const spec: TaskSpec = {
        id: "task-9",
        title: "Payment update",
        prompt: "Update the payment processing logic",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "low"
      };

      const result = scoreTaskComplexity(spec);

      expect(result.level).toBe("L3");
    });
  });
});
