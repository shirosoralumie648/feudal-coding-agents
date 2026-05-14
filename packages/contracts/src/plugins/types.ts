import { z } from "zod";

export const PLUGIN_LIFECYCLE_STATES = [
  "discovered",
  "registered",
  "enabled",
  "disabled",
  "failed"
] as const;

export const PluginLifecycleStateSchema = z.enum(PLUGIN_LIFECYCLE_STATES);

export const PLUGIN_EXTENSION_POINT_TYPES = [
  "acp-worker",
  "workflow-step-provider"
] as const;

export const PluginExtensionPointTypeSchema = z.enum(
  PLUGIN_EXTENSION_POINT_TYPES
);

export const PluginIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/, "Plugin id must be lowercase dot/dash separated");

export const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

export const AcpWorkerExtensionSchema = z.object({
  type: z.literal("acp-worker"),
  id: PluginIdSchema,
  workerName: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.array(z.string().min(1)).min(1),
  artifactName: z.string().min(1),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  promptTemplate: z.string().optional(),
  required: z.boolean().default(false),
  enabledByDefault: z.boolean().default(false)
});

export const WorkflowStepProviderExtensionSchema = z.object({
  type: z.literal("workflow-step-provider"),
  id: PluginIdSchema,
  providerId: z.string().min(1),
  stepTypes: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
  configSchema: z.record(z.string(), z.unknown()).default({})
});

export const PluginExtensionPointSchema = z.discriminatedUnion("type", [
  AcpWorkerExtensionSchema,
  WorkflowStepProviderExtensionSchema
]);

export const PLUGIN_PERMISSION_TYPES = [
  "filesystem",
  "network",
  "secrets",
  "process",
  "workflow"
] as const;

export const PluginPermissionTypeSchema = z.enum(PLUGIN_PERMISSION_TYPES);

export const PLUGIN_PERMISSION_ACCESSES = [
  "read",
  "write",
  "execute",
  "connect",
  "admin"
] as const;

export const PluginPermissionAccessSchema = z.enum(
  PLUGIN_PERMISSION_ACCESSES
);

export const PluginPermissionSchema = z
  .object({
    type: PluginPermissionTypeSchema,
    access: PluginPermissionAccessSchema,
    target: z.string().min(1),
    justification: z.string().min(1),
    required: z.boolean().default(true)
  })
  .strict();

export const PluginSecuritySchema = z
  .object({
    sandbox: z.literal("trusted-local").default("trusted-local"),
    permissions: z.array(PluginPermissionSchema).default([])
  })
  .strict()
  .default({ sandbox: "trusted-local", permissions: [] });

export const PluginManifestSchema = z
  .object({
    id: PluginIdSchema,
    name: z.string().min(1),
    version: z.string().regex(SEMVER_REGEX, "Version must be valid semver"),
    description: z.string().optional(),
    capabilities: z.array(z.string().min(1)).min(1),
    extensionPoints: z.array(PluginExtensionPointSchema).min(1),
    entry: z.object({
      module: z.string().min(1),
      exportName: z.string().min(1).optional()
    }),
    enabledByDefault: z.boolean().default(false),
    compatibility: z.object({
      app: z.literal("feudal-coding-agents"),
      minVersion: z.string().regex(SEMVER_REGEX).optional(),
      maxVersion: z.string().regex(SEMVER_REGEX).optional()
    }),
    security: PluginSecuritySchema,
    metadata: z.record(z.string(), z.unknown()).default({})
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    manifest.extensionPoints.forEach((extensionPoint, index) => {
      if (seen.has(extensionPoint.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate extension point id "${extensionPoint.id}"`,
          path: ["extensionPoints", index, "id"]
        });
      }
      seen.add(extensionPoint.id);
    });
  });

export const PluginDiagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  details: z.unknown().optional()
});

export const PluginSourceSchema = z.object({
  kind: z.enum(["local-directory", "inline"]),
  rootPath: z.string().optional(),
  manifestPath: z.string().optional()
});

export const PluginRecordSchema = z.object({
  manifest: PluginManifestSchema,
  state: PluginLifecycleStateSchema,
  source: PluginSourceSchema,
  diagnostics: z.array(PluginDiagnosticSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  enabledAt: z.string().optional(),
  disabledAt: z.string().optional(),
  lastReloadedAt: z.string().optional()
});

export const EnabledPluginExtensionsSchema = z.object({
  acpWorkers: z.array(AcpWorkerExtensionSchema),
  workflowStepProviders: z.array(WorkflowStepProviderExtensionSchema)
});

export const PluginRiskLevelSchema = z.enum([
  "low",
  "medium",
  "high",
  "critical"
]);

export const PluginCompatibilityStatusSchema = z.enum([
  "compatible",
  "incompatible",
  "unknown"
]);

export const PluginCompatibilityReviewSchema = z.object({
  status: PluginCompatibilityStatusSchema,
  app: z.literal("feudal-coding-agents"),
  currentVersion: z.string().regex(SEMVER_REGEX).optional(),
  minVersion: z.string().regex(SEMVER_REGEX).optional(),
  maxVersion: z.string().regex(SEMVER_REGEX).optional(),
  reason: z.string().min(1)
});

export const PluginSecurityReviewSchema = z.object({
  pluginId: PluginIdSchema,
  riskLevel: PluginRiskLevelSchema,
  approvalRequired: z.boolean(),
  permissions: z.array(PluginPermissionSchema),
  findings: z.array(PluginDiagnosticSchema),
  recommendations: z.array(z.string()).default([]),
  reviewedAt: z.string()
});

export const PluginMarketplaceStateSchema = z.enum([
  ...PLUGIN_LIFECYCLE_STATES,
  "available"
]);

export const PluginMarketplaceEntrySchema = z.object({
  pluginId: PluginIdSchema,
  name: z.string().min(1),
  version: z.string().regex(SEMVER_REGEX),
  description: z.string().optional(),
  state: PluginMarketplaceStateSchema,
  sourceKind: z.string().min(1),
  extensionTypes: z.array(PluginExtensionPointTypeSchema),
  compatibility: PluginCompatibilityReviewSchema,
  security: PluginSecurityReviewSchema
});

export type PluginLifecycleState = z.infer<
  typeof PluginLifecycleStateSchema
>;
export type PluginExtensionPointType = z.infer<
  typeof PluginExtensionPointTypeSchema
>;
export type PluginId = z.infer<typeof PluginIdSchema>;
export type AcpWorkerExtension = z.infer<typeof AcpWorkerExtensionSchema>;
export type WorkflowStepProviderExtension = z.infer<
  typeof WorkflowStepProviderExtensionSchema
>;
export type PluginExtensionPoint = z.infer<typeof PluginExtensionPointSchema>;
export type PluginPermissionType = z.infer<typeof PluginPermissionTypeSchema>;
export type PluginPermissionAccess = z.infer<
  typeof PluginPermissionAccessSchema
>;
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;
export type PluginSecurity = z.infer<typeof PluginSecuritySchema>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginDiagnostic = z.infer<typeof PluginDiagnosticSchema>;
export type PluginSource = z.infer<typeof PluginSourceSchema>;
export type PluginRecord = z.infer<typeof PluginRecordSchema>;
export type EnabledPluginExtensions = z.infer<
  typeof EnabledPluginExtensionsSchema
>;
export type PluginRiskLevel = z.infer<typeof PluginRiskLevelSchema>;
export type PluginCompatibilityStatus = z.infer<
  typeof PluginCompatibilityStatusSchema
>;
export type PluginCompatibilityReview = z.infer<
  typeof PluginCompatibilityReviewSchema
>;
export type PluginSecurityReview = z.infer<
  typeof PluginSecurityReviewSchema
>;
export type PluginMarketplaceState = z.infer<typeof PluginMarketplaceStateSchema>;
export type PluginMarketplaceEntry = z.infer<
  typeof PluginMarketplaceEntrySchema
>;
