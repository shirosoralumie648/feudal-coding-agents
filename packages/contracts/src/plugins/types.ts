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
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginDiagnostic = z.infer<typeof PluginDiagnosticSchema>;
export type PluginSource = z.infer<typeof PluginSourceSchema>;
export type PluginRecord = z.infer<typeof PluginRecordSchema>;
export type EnabledPluginExtensions = z.infer<
  typeof EnabledPluginExtensionsSchema
>;

