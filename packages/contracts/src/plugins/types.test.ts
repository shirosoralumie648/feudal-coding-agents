import { describe, expect, it } from "vitest";
import {
  PLUGIN_LIFECYCLE_STATES,
  PluginLifecycleStateSchema,
  PluginManifestSchema,
  definePluginManifest,
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
  }
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
});

