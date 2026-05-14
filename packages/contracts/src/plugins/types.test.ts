import { describe, expect, it } from "vitest";
import {
  PluginCompatibilityReviewSchema,
  PluginMarketplaceEntrySchema,
  PLUGIN_LIFECYCLE_STATES,
  PluginPermissionSchema,
  PluginSecurityReviewSchema,
  PluginLifecycleStateSchema,
  PluginManifestSchema,
  defineAcpWorkerExtension,
  definePluginManifest,
  definePluginPermission,
  defineWorkflowStepProviderExtension,
  evaluatePluginCompatibility,
  validatePluginManifest,
  type PluginManifest
} from "./index";

const baseManifest = {
  id: "local.agent-plugin",
  name: "Local Agent Plugin",
  version: "1.0.0",
  capabilities: ["agent-registration"],
  entry: {
    module: "dist/index.js"
  },
  compatibility: {
    app: "feudal-coding-agents"
  },
  security: {
    permissions: []
  },
  metadata: {}
} satisfies Omit<PluginManifest, "extensionPoints">;

describe("plugin contracts", () => {
  it("parses a valid manifest with an acp-worker extension", () => {
    const manifest = PluginManifestSchema.parse({
      ...baseManifest,
      extensionPoints: [
        {
          type: "acp-worker",
          id: "local.agent-plugin.worker",
          workerName: "local-worker",
          displayName: "Local Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json"
        }
      ]
    });

    expect(manifest.extensionPoints[0]?.type).toBe("acp-worker");
    expect(manifest.enabledByDefault).toBe(false);
    expect(manifest.security.permissions).toEqual([]);
  });

  it("parses a valid manifest with a workflow-step-provider extension", () => {
    const manifest = PluginManifestSchema.parse({
      ...baseManifest,
      id: "local.workflow-plugin",
      extensionPoints: [
        {
          type: "workflow-step-provider",
          id: "local.workflow-plugin.provider",
          providerId: "workflow-provider",
          stepTypes: ["deployment"],
          description: "Adds deployment workflow steps."
        }
      ]
    });

    expect(manifest.extensionPoints[0]?.type).toBe("workflow-step-provider");
  });

  it("rejects unknown extension point types", () => {
    const result = PluginManifestSchema.safeParse({
      ...baseManifest,
      extensionPoints: [
        {
          type: "route-injection",
          id: "local.agent-plugin.route"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate extension point ids", () => {
    const result = PluginManifestSchema.safeParse({
      ...baseManifest,
      extensionPoints: [
        {
          type: "acp-worker",
          id: "duplicate.extension",
          workerName: "local-worker",
          displayName: "Local Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json"
        },
        {
          type: "workflow-step-provider",
          id: "duplicate.extension",
          providerId: "workflow-provider",
          stepTypes: ["deployment"],
          description: "Adds deployment workflow steps."
        }
      ]
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(
      "Duplicate extension point id"
    );
  });

  it("exposes the exact lifecycle state set", () => {
    expect(PluginLifecycleStateSchema.options).toEqual([
      "discovered",
      "registered",
      "enabled",
      "disabled",
      "failed"
    ]);
    expect(PLUGIN_LIFECYCLE_STATES).toEqual([
      "discovered",
      "registered",
      "enabled",
      "disabled",
      "failed"
    ]);
  });

  it("supports internal SDK helpers", () => {
    const manifest = {
      ...baseManifest,
      extensionPoints: [
        {
          type: "acp-worker",
          id: "local.agent-plugin.worker",
          workerName: "local-worker",
          displayName: "Local Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json"
        }
      ]
    } satisfies PluginManifest;

    expect(definePluginManifest(manifest).id).toBe("local.agent-plugin");
    expect(validatePluginManifest(manifest).success).toBe(true);
  });

  it("parses plugin security permissions and shared ecosystem review shapes", () => {
    const permission = PluginPermissionSchema.parse({
      type: "process",
      access: "execute",
      target: "codex",
      justification: "Run a local code review worker"
    });
    const manifest = PluginManifestSchema.parse({
      ...baseManifest,
      extensionPoints: [
        {
          type: "acp-worker",
          id: "local.agent-plugin.worker",
          workerName: "local-worker",
          displayName: "Local Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json"
        }
      ],
      security: {
        permissions: [permission]
      }
    });
    const review = PluginSecurityReviewSchema.parse({
      pluginId: manifest.id,
      riskLevel: "high",
      approvalRequired: true,
      permissions: manifest.security.permissions,
      findings: [
        {
          code: "PLUGIN_PERMISSION_PROCESS",
          message: "Process execution requires admin approval",
          severity: "error"
        }
      ],
      recommendations: ["Review the plugin entry module before enabling"],
      reviewedAt: "2026-05-04T00:00:00.000Z"
    });
    const compatibility = PluginCompatibilityReviewSchema.parse({
      status: "compatible",
      app: "feudal-coding-agents",
      currentVersion: "1.0.0",
      reason: "Manifest targets this app"
    });
    const entry = PluginMarketplaceEntrySchema.parse({
      pluginId: manifest.id,
      name: manifest.name,
      version: manifest.version,
      state: "available",
      sourceKind: "local-directory",
      extensionTypes: ["acp-worker"],
      compatibility,
      security: review
    });

    expect(entry.security.riskLevel).toBe("high");
    expect(entry.compatibility.status).toBe("compatible");
  });

  it("builds extension declarations, permissions, and compatibility reviews through SDK helpers", () => {
    const worker = defineAcpWorkerExtension({
      type: "acp-worker",
      id: "local.sdk-plugin.worker",
      workerName: "sdk-worker",
      displayName: "SDK Worker",
      capabilities: ["sdk-example"],
      artifactName: "sdk-output.json"
    });
    const provider = defineWorkflowStepProviderExtension({
      type: "workflow-step-provider",
      id: "local.sdk-plugin.provider",
      providerId: "sdk-provider",
      stepTypes: ["sdk-step"],
      description: "Adds SDK workflow steps."
    });
    const permission = definePluginPermission({
      type: "filesystem",
      access: "read",
      target: "repo",
      justification: "Read repository files for analysis"
    });
    const manifest = definePluginManifest({
      ...baseManifest,
      id: "local.sdk-plugin",
      extensionPoints: [worker, provider],
      security: {
        permissions: [permission]
      }
    });

    const compatible = evaluatePluginCompatibility(manifest, {
      appVersion: "1.2.0"
    });
    const incompatible = evaluatePluginCompatibility(
      {
        ...manifest,
        compatibility: {
          app: "feudal-coding-agents",
          minVersion: "2.0.0"
        }
      },
      { appVersion: "1.2.0" }
    );

    expect(manifest.extensionPoints).toHaveLength(2);
    expect(compatible.status).toBe("compatible");
    expect(incompatible.status).toBe("incompatible");
  });
});
