import { z } from "zod";

// ---- Domain Constants ----

/** Per D-03: Step types map to ACPRunSummaryPhase */
export const STEP_TYPES = [
  "intake",
  "planning",
  "review",
  "approval",
  "execution",
  "verification"
] as const;

/** Per D-06: Supported parameter types */
export const PARAMETER_TYPES = ["string", "number", "boolean", "enum"] as const;

/** Per D-04: Supported condition operators */
export const CONDITION_OPERATORS = ["equals", "notEquals", "contains"] as const;

/** Template lifecycle status */
export const TEMPLATE_STATUSES = ["draft", "published"] as const;

/** Per D-16: Semver version regex — \d+\.\d+\.\d+ at minimum */
export const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

// ---- Zod Schemas ----

export const TemplateParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(PARAMETER_TYPES),
  required: z.boolean(),
  description: z.string(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  enumValues: z.array(z.string().min(1)).optional()
}).refine(
  (param) => param.type !== "enum" || (param.enumValues && param.enumValues.length > 0),
  { message: "enumValues is required when type is 'enum'" }
);

export const TemplateConditionSchema = z.object({
  sourceStepId: z.string().min(1),
  path: z.string().min(1),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean()])
});

export const TemplateStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(STEP_TYPES),
  agent: z.string().min(1),
  dependsOn: z.array(z.string()),
  conditions: z.array(TemplateConditionSchema).optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

export const WorkflowTemplateSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(SEMVER_REGEX, "Version must be valid semver (e.g., 1.0.0)"),
  parameters: z.array(TemplateParameterSchema),
  steps: z.array(TemplateStepSchema).min(1),
  status: z.enum(TEMPLATE_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastPublishedVersion: z.number().int().nonnegative().optional(),
  eventVersion: z.number().int().nonnegative()
});

export const TemplateInstantiationSchema = z.object({
  templateName: z.string().min(1),
  templateVersion: z.string().min(1),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
});

export const TemplateExportPackageSchema = z.object({
  format: z.literal("feudal-template/v1"),
  template: z.object({
    name: z.string().min(1),
    version: z.string().regex(SEMVER_REGEX, "Version must be valid semver (e.g., 1.0.0)"),
    parameters: z.array(TemplateParameterSchema),
    steps: z.array(TemplateStepSchema).min(1),
    createdAt: z.string(),
    updatedAt: z.string()
  }),
  exportedAt: z.string()
});

// ---- Explicit TypeScript Interfaces (canonical types) ----

export interface TemplateParameter {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "enum";
  readonly required: boolean;
  readonly description: string;
  readonly default?: string | number | boolean;
  readonly enumValues?: string[];
}

export interface TemplateCondition {
  readonly sourceStepId: string;
  readonly path: string;
  readonly operator: "equals" | "notEquals" | "contains";
  readonly value: string | number | boolean;
}

export interface TemplateStep {
  readonly id: string;
  readonly type: "intake" | "planning" | "review" | "approval" | "execution" | "verification";
  readonly agent: string;
  readonly dependsOn: string[];
  readonly conditions?: TemplateCondition[];
  readonly config?: Record<string, unknown>;
}

export type TemplateStatus = "draft" | "published";

export interface WorkflowTemplate {
  readonly name: string;
  readonly version: string;
  readonly parameters: TemplateParameter[];
  readonly steps: TemplateStep[];
  readonly status: TemplateStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastPublishedVersion?: number;
  readonly eventVersion: number;
}

export interface TemplateInstantiation {
  readonly templateName: string;
  readonly templateVersion: string;
  readonly parameters: Record<string, string | number | boolean>;
}

export interface TemplateExportPackage {
  readonly format: "feudal-template/v1";
  readonly template: Omit<WorkflowTemplate, "status" | "eventVersion" | "lastPublishedVersion">;
  readonly exportedAt: string;
}
