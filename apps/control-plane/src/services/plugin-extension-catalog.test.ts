import { describe, expect, it } from "vitest";
import type { PluginManifest } from "@feudal/contracts";
import { PluginExtensionCatalog } from "./plugin-extension-catalog";
import { MemoryPluginStore } from "./plugin-store";

function makeManifest(
  overrides: Partial<PluginManifest> = {}
): PluginManifest {
  return {
    id: overrides.id ?? "local.enabled-plugin",
    name: overrides.name ?? "Local Enabled Plugin",
    version: overrides.version ?? "1.0.0",
    capabilities: overrides.capabilities ?? ["agent-registration"],
    extensionPoints:
      overrides.extensionPoints ??
      [
        {
          type: "acp-worker",
          id: "local.enabled-plugin.worker",
          workerName: "enabled-worker",
          displayName: "Enabled Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json",
          outputSchema: {},
          required: false,
          enabledByDefault: true
        },
        {
          type: "workflow-step-provider",
          id: "local.enabled-plugin.workflow",
          providerId: "enabled-workflow-provider",
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
    metadata: overrides.metadata ?? {}
  };
}

describe("PluginExtensionCatalog", () => {
  it("returns enabled ACP workers and workflow step providers only", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest(),
      source: { kind: "inline" }
    });
    await store.registerDiscovered({
      manifest: makeManifest({
        id: "local.disabled-plugin",
        enabledByDefault: false,
        extensionPoints: [
          {
            type: "acp-worker",
            id: "local.disabled-plugin.worker",
            workerName: "disabled-worker",
            displayName: "Disabled Worker",
            capabilities: ["assignment"],
            artifactName: "assignment.json",
            outputSchema: {},
            required: false,
            enabledByDefault: false
          },
          {
            type: "workflow-step-provider",
            id: "local.disabled-plugin.workflow",
            providerId: "disabled-workflow-provider",
            stepTypes: ["deployment"],
            description: "Adds disabled workflow steps.",
            configSchema: {}
          }
        ]
      }),
      source: { kind: "inline" }
    });
    const catalog = new PluginExtensionCatalog(store);

    const workers = await catalog.listAcpWorkers();
    const providers = await catalog.listWorkflowStepProviders();
    const snapshot = await catalog.listEnabledExtensions();

    expect(workers.map((worker) => worker.workerName)).toEqual([
      "enabled-worker"
    ]);
    expect(providers.map((provider) => provider.providerId)).toEqual([
      "enabled-workflow-provider"
    ]);
    expect(snapshot.acpWorkers).toHaveLength(1);
    expect(snapshot.workflowStepProviders).toHaveLength(1);
  });

  it("finds enabled extension declarations by their runtime identifiers", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest(),
      source: { kind: "inline" }
    });
    const catalog = new PluginExtensionCatalog(store);

    await expect(catalog.hasAcpWorker("enabled-worker")).resolves.toBe(true);
    await expect(catalog.hasAcpWorker("missing-worker")).resolves.toBe(false);
    await expect(
      catalog.hasWorkflowStepProvider("enabled-workflow-provider")
    ).resolves.toBe(true);
    await expect(
      catalog.hasWorkflowStepProvider("missing-provider")
    ).resolves.toBe(false);
    await expect(catalog.getAcpWorker("enabled-worker")).resolves.toMatchObject(
      { workerName: "enabled-worker" }
    );
    await expect(
      catalog.getWorkflowStepProvider("enabled-workflow-provider")
    ).resolves.toMatchObject({ providerId: "enabled-workflow-provider" });
    await expect(catalog.listAcpWorkerNames()).resolves.toEqual([
      "enabled-worker"
    ]);
    await expect(catalog.listWorkflowStepProviderIds()).resolves.toEqual([
      "enabled-workflow-provider"
    ]);
    await expect(catalog.listWorkflowStepTypes()).resolves.toEqual([
      "deployment"
    ]);
  });
});
