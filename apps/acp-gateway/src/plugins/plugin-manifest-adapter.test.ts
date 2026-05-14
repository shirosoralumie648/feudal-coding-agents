import { describe, expect, it } from "vitest";
import type { PluginManifest, PluginRecord } from "@feudal/contracts";
import {
  createPluginAgentMetadata,
  isAcpWorkerExtension,
  pluginManifestToAgentRegistrations,
  pluginRecordToAgentRegistrations,
  pluginRecordsToAgentRegistrations
} from "./plugin-manifest-adapter";

function makeManifest(
  overrides: Partial<PluginManifest> = {}
): PluginManifest {
  return {
    id: overrides.id ?? "local.gateway-plugin",
    name: overrides.name ?? "Local Gateway Plugin",
    version: overrides.version ?? "1.0.0",
    capabilities: overrides.capabilities ?? ["agent-registration"],
    extensionPoints:
      overrides.extensionPoints ??
      [
        {
          type: "acp-worker",
          id: "local.gateway-plugin.worker",
          workerName: "gateway-plugin-worker",
          displayName: "Gateway Plugin Worker",
          capabilities: ["assignment", "execution-report"],
          artifactName: "execution-report.json",
          outputSchema: {},
          required: false,
          enabledByDefault: true
        },
        {
          type: "workflow-step-provider",
          id: "local.gateway-plugin.workflow",
          providerId: "gateway-workflow-provider",
          stepTypes: ["deployment"],
          description: "Adds deployment workflow steps.",
          configSchema: {}
        }
      ],
    entry: overrides.entry ?? { module: "dist/index.js" },
    enabledByDefault: overrides.enabledByDefault ?? true,
    compatibility: overrides.compatibility ?? {
      app: "feudal-coding-agents"
    },
    security: overrides.security ?? {
      permissions: []
    },
    metadata: overrides.metadata ?? {}
  };
}

function makeRecord(state: PluginRecord["state"]): PluginRecord {
  const now = "2026-05-02T00:00:00.000Z";
  return {
    manifest: makeManifest({ id: `local.${state}-plugin` }),
    state,
    source: { kind: "inline" },
    diagnostics: [],
    createdAt: now,
    updatedAt: now,
    enabledAt: state === "enabled" ? now : undefined
  };
}

describe("plugin manifest adapter", () => {
  it("converts acp-worker extensions into agent registration inputs", () => {
    const manifest = makeManifest();
    const registrations = pluginManifestToAgentRegistrations(manifest);
    const workerExtension = manifest.extensionPoints.find(isAcpWorkerExtension);

    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({
      agentId: "gateway-plugin-worker",
      capabilities: ["assignment", "execution-report"],
      status: "online",
      isTemporary: false,
      metadata: {
        pluginId: "local.gateway-plugin",
        pluginVersion: "1.0.0",
        extensionPoint: "acp-worker",
        displayName: "Gateway Plugin Worker",
        artifactName: "execution-report.json",
        required: false,
        enabledByDefault: true
      }
    });
    expect(workerExtension).toBeDefined();
    expect(createPluginAgentMetadata(manifest, workerExtension!)).toMatchObject(
      {
        pluginId: "local.gateway-plugin",
        pluginVersion: "1.0.0",
        extensionPoint: "acp-worker"
      }
    );
  });

  it("ignores workflow-step-provider extension points", () => {
    const registrations = pluginManifestToAgentRegistrations(
      makeManifest({
        extensionPoints: [
          {
            type: "workflow-step-provider",
            id: "local.workflow-only.provider",
            providerId: "workflow-only-provider",
            stepTypes: ["deployment"],
            description: "Adds deployment workflow steps.",
            configSchema: {}
          }
        ]
      })
    );

    expect(registrations).toEqual([]);
  });

  it("filters out non-enabled plugin records", () => {
    const registrations = pluginRecordsToAgentRegistrations([
      makeRecord("disabled"),
      makeRecord("registered"),
      makeRecord("discovered"),
      makeRecord("failed"),
      makeRecord("enabled")
    ]);

    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.metadata?.pluginId).toBe("local.enabled-plugin");
    expect(pluginRecordToAgentRegistrations(makeRecord("disabled"))).toEqual(
      []
    );
  });
});
