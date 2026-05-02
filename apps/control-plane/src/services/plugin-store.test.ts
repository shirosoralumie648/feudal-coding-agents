import { describe, expect, it } from "vitest";
import { MemoryPluginStore } from "./plugin-store";
import type { PluginDiagnostic, PluginManifest } from "@feudal/contracts";

function makeManifest(
  overrides: Partial<PluginManifest> = {}
): PluginManifest {
  return {
    id: overrides.id ?? "local.agent-plugin",
    name: overrides.name ?? "Local Agent Plugin",
    version: overrides.version ?? "1.0.0",
    capabilities: overrides.capabilities ?? ["agent-registration"],
    extensionPoints:
      overrides.extensionPoints ??
      [
        {
          type: "acp-worker",
          id: "local.agent-plugin.worker",
          workerName: "local-worker",
          displayName: "Local Worker",
          capabilities: ["assignment"],
          artifactName: "assignment.json",
          outputSchema: {},
          required: false,
          enabledByDefault: false
        },
        {
          type: "workflow-step-provider",
          id: "local.agent-plugin.workflow",
          providerId: "local-workflow-provider",
          stepTypes: ["deployment"],
          description: "Adds deployment workflow steps.",
          configSchema: {}
        }
      ],
    entry: overrides.entry ?? { module: "dist/index.js" },
    enabledByDefault: overrides.enabledByDefault ?? false,
    compatibility: overrides.compatibility ?? {
      app: "feudal-coding-agents"
    },
    metadata: overrides.metadata ?? {}
  };
}

const source = {
  kind: "local-directory" as const,
  rootPath: "/repo/plugins/local-agent-plugin",
  manifestPath: "/repo/plugins/local-agent-plugin/plugin.json"
};

describe("MemoryPluginStore", () => {
  it("registers discovered plugins as registered by default", async () => {
    const store = new MemoryPluginStore();

    const record = await store.registerDiscovered({
      manifest: makeManifest(),
      source
    });

    expect(record.state).toBe("registered");
    expect(record.manifest.id).toBe("local.agent-plugin");
    expect(record.createdAt).toBeTruthy();
  });

  it("registers enabled-by-default plugins as enabled", async () => {
    const store = new MemoryPluginStore();

    const record = await store.registerDiscovered({
      manifest: makeManifest({ enabledByDefault: true }),
      source
    });

    expect(record.state).toBe("enabled");
    expect(record.enabledAt).toBeTruthy();
  });

  it("rejects duplicate plugin ids", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({ manifest: makeManifest(), source });

    await expect(
      store.registerDiscovered({
        manifest: makeManifest({ version: "1.1.0" }),
        source
      })
    ).rejects.toThrow(/already exists/);
  });

  it("enables and disables plugins with lifecycle history", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({ manifest: makeManifest(), source });

    const enabled = await store.enablePlugin("local.agent-plugin");
    const disabled = await store.disablePlugin("local.agent-plugin");
    const history = await store.getPluginLifecycleHistory("local.agent-plugin");

    expect(enabled.state).toBe("enabled");
    expect(disabled.state).toBe("disabled");
    expect(history.map((event) => event.eventType)).toEqual([
      "plugin.registered",
      "plugin.enabled",
      "plugin.disabled"
    ]);
  });

  it("marks plugins failed and blocks enabling failed plugins", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({ manifest: makeManifest(), source });
    const diagnostic: PluginDiagnostic = {
      code: "PLUGIN_ENTRY_NOT_FOUND",
      message: "Entry module does not exist",
      severity: "error"
    };

    const failed = await store.markPluginFailed(
      "local.agent-plugin",
      diagnostic
    );

    expect(failed.state).toBe("failed");
    expect(failed.diagnostics).toContainEqual(diagnostic);
    await expect(store.enablePlugin("local.agent-plugin")).rejects.toThrow(
      /Cannot enable failed plugin/
    );
  });

  it("can create a failed record from a diagnostic that carries a manifest", async () => {
    const store = new MemoryPluginStore();

    const failed = await store.markPluginFailed("local.agent-plugin", {
      code: "PLUGIN_MANIFEST_INVALID",
      message: "Manifest failed validation",
      severity: "error",
      details: {
        manifest: makeManifest()
      }
    });

    expect(failed.state).toBe("failed");
    expect(failed.manifest.id).toBe("local.agent-plugin");
  });

  it("reloads plugins, preserves enabled state, and resets failed state to registered", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest(),
      source
    });
    await store.enablePlugin("local.agent-plugin");

    const reloaded = await store.reloadPlugin(
      "local.agent-plugin",
      makeManifest({ version: "1.1.0" })
    );
    expect(reloaded.state).toBe("enabled");
    expect(reloaded.manifest.version).toBe("1.1.0");
    expect(reloaded.lastReloadedAt).toBeTruthy();

    await store.markPluginFailed("local.agent-plugin", {
      code: "PLUGIN_IMPORT_FAILED",
      message: "Import failed",
      severity: "error"
    });
    const recovered = await store.reloadPlugin(
      "local.agent-plugin",
      makeManifest({ version: "1.2.0" })
    );

    expect(recovered.state).toBe("registered");
  });

  it("rejects reloads with mismatched plugin ids", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({ manifest: makeManifest(), source });

    await expect(
      store.reloadPlugin(
        "local.agent-plugin",
        makeManifest({ id: "local.other-plugin" })
      )
    ).rejects.toThrow(/id mismatch/);
  });

  it("lists plugins by optional lifecycle state", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({ manifest: makeManifest(), source });
    await store.registerDiscovered({
      manifest: makeManifest({
        id: "local.enabled-plugin",
        enabledByDefault: true,
        extensionPoints: [
          {
            type: "acp-worker",
            id: "local.enabled-plugin.worker",
            workerName: "enabled-worker",
            displayName: "Enabled Worker",
            capabilities: ["execution-report"],
            artifactName: "execution-report.json",
            outputSchema: {},
            required: false,
            enabledByDefault: true
          }
        ]
      }),
      source
    });

    expect(await store.listPlugins()).toHaveLength(2);
    expect(await store.listPlugins({ state: "enabled" })).toHaveLength(1);
  });

  it("lists enabled extensions only from enabled plugins", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({ manifest: makeManifest(), source });
    await store.registerDiscovered({
      manifest: makeManifest({
        id: "local.enabled-plugin",
        enabledByDefault: true,
        extensionPoints: [
          {
            type: "acp-worker",
            id: "local.enabled-plugin.worker",
            workerName: "enabled-worker",
            displayName: "Enabled Worker",
            capabilities: ["execution-report"],
            artifactName: "execution-report.json",
            outputSchema: {},
            required: false,
            enabledByDefault: true
          },
          {
            type: "workflow-step-provider",
            id: "local.enabled-plugin.workflow",
            providerId: "enabled-workflow-provider",
            stepTypes: ["verification"],
            description: "Adds verification workflow steps.",
            configSchema: {}
          }
        ]
      }),
      source
    });

    const enabled = await store.listEnabledExtensions();

    expect(enabled.acpWorkers.map((worker) => worker.workerName)).toEqual([
      "enabled-worker"
    ]);
    expect(
      enabled.workflowStepProviders.map((provider) => provider.providerId)
    ).toEqual(["enabled-workflow-provider"]);
  });
});

