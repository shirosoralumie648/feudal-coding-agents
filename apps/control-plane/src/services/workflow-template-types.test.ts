import { describe, expect, it } from "vitest";
import {
  WorkflowTemplateSchema,
  TemplateParameterSchema,
  TemplateStepSchema,
  TemplateConditionSchema,
  TemplateInstantiationSchema,
  TemplateExportPackageSchema
} from "./workflow-template-types";

// ---- Test 1: WorkflowTemplateSchema validates a complete template ----
describe("WorkflowTemplateSchema", () => {
  const validTemplate = {
    name: "standard-code-review",
    version: "1.0.0",
    parameters: [
      {
        name: "codebasePath",
        type: "string",
        required: true,
        description: "Path to the codebase to review"
      },
      {
        name: "maxIssues",
        type: "number",
        required: false,
        description: "Maximum number of issues to report",
        default: 50
      }
    ],
    steps: [
      {
        id: "intake-step",
        type: "intake",
        agent: "intake-agent",
        dependsOn: [],
        config: { prompt: "Analyze codebase at ${params.codebasePath}" }
      },
      {
        id: "review-step",
        type: "review",
        agent: "auditor-agent",
        dependsOn: ["intake-step"],
        config: {}
      }
    ],
    status: "draft",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    lastPublishedVersion: 1,
    eventVersion: 0
  };

  it("validates a complete template object successfully", () => {
    const result = WorkflowTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  // ---- Test 2: rejects template missing "name" ----
  it("rejects a template missing the required name field", () => {
    const { name, ...withoutName } = validTemplate;
    const result = WorkflowTemplateSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it("rejects a template with empty name", () => {
    const result = WorkflowTemplateSchema.safeParse({
      ...validTemplate,
      name: ""
    });
    expect(result.success).toBe(false);
  });

  it("rejects a template with invalid semver version", () => {
    const result = WorkflowTemplateSchema.safeParse({
      ...validTemplate,
      version: "not-a-version"
    });
    expect(result.success).toBe(false);
  });

  it("accepts semver with pre-release and build suffixes", () => {
    const withPreRelease = WorkflowTemplateSchema.safeParse({
      ...validTemplate,
      version: "2.0.0-beta.1"
    });
    expect(withPreRelease.success).toBe(true);

    const withBuild = WorkflowTemplateSchema.safeParse({
      ...validTemplate,
      version: "1.0.0+build.123"
    });
    expect(withBuild.success).toBe(true);

    const withBoth = WorkflowTemplateSchema.safeParse({
      ...validTemplate,
      version: "3.0.0-rc.2+build.456"
    });
    expect(withBoth.success).toBe(true);
  });

  it("rejects a template with no steps", () => {
    const result = WorkflowTemplateSchema.safeParse({
      ...validTemplate,
      steps: []
    });
    expect(result.success).toBe(false);
  });

  it("rejects a template with invalid status", () => {
    const result = WorkflowTemplateSchema.safeParse({
      ...validTemplate,
      status: "archived"
    });
    expect(result.success).toBe(false);
  });
});

// ---- Test 3 & 4: TemplateParameterSchema ----
describe("TemplateParameterSchema", () => {
  it("validates a string parameter", () => {
    const result = TemplateParameterSchema.safeParse({
      name: "codebasePath",
      type: "string",
      required: true,
      description: "Path to codebase"
    });
    expect(result.success).toBe(true);
  });

  it("validates a number parameter", () => {
    const result = TemplateParameterSchema.safeParse({
      name: "maxIssues",
      type: "number",
      required: false,
      description: "Max issues",
      default: 50
    });
    expect(result.success).toBe(true);
  });

  it("validates a boolean parameter", () => {
    const result = TemplateParameterSchema.safeParse({
      name: "autoApprove",
      type: "boolean",
      required: false,
      description: "Auto approve flag",
      default: false
    });
    expect(result.success).toBe(true);
  });

  it("validates an enum parameter with enumValues", () => {
    const result = TemplateParameterSchema.safeParse({
      name: "reviewLevel",
      type: "enum",
      required: true,
      description: "Review level",
      enumValues: ["basic", "standard", "deep"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type values like array", () => {
    const result = TemplateParameterSchema.safeParse({
      name: "items",
      type: "array",
      required: false,
      description: "Items list"
    });
    expect(result.success).toBe(false);
  });

  // ---- Test 4: enumValues required when type is enum ----
  it("requires enumValues array when type is enum", () => {
    const withoutEnumValues = TemplateParameterSchema.safeParse({
      name: "reviewLevel",
      type: "enum",
      required: true,
      description: "Review level"
    });
    expect(withoutEnumValues.success).toBe(false);
  });

  it("accepts enum with valid enumValues", () => {
    const result = TemplateParameterSchema.safeParse({
      name: "reviewLevel",
      type: "enum",
      required: true,
      description: "Review level",
      enumValues: ["basic", "standard", "deep"]
    });
    expect(result.success).toBe(true);
  });
});

// ---- Test 5 & 6: TemplateStepSchema ----
describe("TemplateStepSchema", () => {
  it("validates a step with type intake", () => {
    const result = TemplateStepSchema.safeParse({
      id: "intake-step",
      type: "intake",
      agent: "intake-agent",
      dependsOn: []
    });
    expect(result.success).toBe(true);
  });

  it("validates a step with type planning", () => {
    const result = TemplateStepSchema.safeParse({
      id: "planning-step",
      type: "planning",
      agent: "analyst-agent",
      dependsOn: ["intake-step"]
    });
    expect(result.success).toBe(true);
  });

  it("validates a step with type review", () => {
    const result = TemplateStepSchema.safeParse({
      id: "review-step",
      type: "review",
      agent: "auditor-agent",
      dependsOn: ["planning-step"]
    });
    expect(result.success).toBe(true);
  });

  it("validates a step with type approval", () => {
    const result = TemplateStepSchema.safeParse({
      id: "approval-step",
      type: "approval",
      agent: "operator",
      dependsOn: ["review-step"]
    });
    expect(result.success).toBe(true);
  });

  it("validates a step with type execution", () => {
    const result = TemplateStepSchema.safeParse({
      id: "execution-step",
      type: "execution",
      agent: "gongbu-executor",
      dependsOn: ["approval-step"]
    });
    expect(result.success).toBe(true);
  });

  it("validates a step with type verification", () => {
    const result = TemplateStepSchema.safeParse({
      id: "verification-step",
      type: "verification",
      agent: "xingbu-verifier",
      dependsOn: ["execution-step"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid step type values", () => {
    const result = TemplateStepSchema.safeParse({
      id: "bad-step",
      type: "deploy",
      agent: "deploy-agent",
      dependsOn: []
    });
    expect(result.success).toBe(false);
  });

  // ---- Test 6: dependsOn validation ----
  it("validates dependsOn as an array of string IDs", () => {
    const result = TemplateStepSchema.safeParse({
      id: "step-1",
      type: "execution",
      agent: "executor",
      dependsOn: ["intake", "planning", "review"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects dependsOn that is not an array", () => {
    const result = TemplateStepSchema.safeParse({
      id: "step-1",
      type: "execution",
      agent: "executor",
      dependsOn: "not-an-array"
    });
    expect(result.success).toBe(false);
  });
});

// ---- Test 7: TemplateConditionSchema ----
describe("TemplateConditionSchema", () => {
  it("validates a condition with equals operator", () => {
    const result = TemplateConditionSchema.safeParse({
      sourceStepId: "review-step",
      path: "verdict",
      operator: "equals",
      value: "approved"
    });
    expect(result.success).toBe(true);
  });

  it("validates a condition with notEquals operator", () => {
    const result = TemplateConditionSchema.safeParse({
      sourceStepId: "review-step",
      path: "verdict",
      operator: "notEquals",
      value: "rejected"
    });
    expect(result.success).toBe(true);
  });

  it("validates a condition with contains operator", () => {
    const result = TemplateConditionSchema.safeParse({
      sourceStepId: "execution-step",
      path: "result",
      operator: "contains",
      value: "error"
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown operators", () => {
    const result = TemplateConditionSchema.safeParse({
      sourceStepId: "step-1",
      path: "status",
      operator: "greaterThan",
      value: 10
    });
    expect(result.success).toBe(false);
  });
});

// ---- Test 8: TemplateInstantiationSchema ----
describe("TemplateInstantiationSchema", () => {
  it("validates an instantiation request with required fields", () => {
    const result = TemplateInstantiationSchema.safeParse({
      templateName: "standard-code-review",
      templateVersion: "1.0.0",
      parameters: {
        codebasePath: "/src/app",
        maxIssues: 25
      }
    });
    expect(result.success).toBe(true);
  });

  it("rejects instantiation with empty templateName", () => {
    const result = TemplateInstantiationSchema.safeParse({
      templateName: "",
      templateVersion: "1.0.0",
      parameters: {}
    });
    expect(result.success).toBe(false);
  });

  it("rejects instantiation with empty templateVersion", () => {
    const result = TemplateInstantiationSchema.safeParse({
      templateName: "my-template",
      templateVersion: "",
      parameters: {}
    });
    expect(result.success).toBe(false);
  });
});

// ---- Test 9: TemplateExportPackageSchema ----
describe("TemplateExportPackageSchema", () => {
  const exportedTemplate = {
    name: "standard-code-review",
    version: "1.0.0",
    parameters: [],
    steps: [
      {
        id: "intake-step",
        type: "intake" as const,
        agent: "intake-agent",
        dependsOn: []
      }
    ],
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z"
  };

  it("validates a complete export package", () => {
    const result = TemplateExportPackageSchema.safeParse({
      format: "feudal-template/v1",
      template: exportedTemplate,
      exportedAt: "2026-04-29T00:00:00.000Z"
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong format value", () => {
    const result = TemplateExportPackageSchema.safeParse({
      format: "feudal-template/v2",
      template: exportedTemplate,
      exportedAt: "2026-04-29T00:00:00.000Z"
    });
    expect(result.success).toBe(false);
  });
});
