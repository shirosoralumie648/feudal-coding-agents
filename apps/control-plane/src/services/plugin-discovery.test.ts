import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PluginDiscovery } from "./plugin-discovery";
import type { PluginManifest } from "@feudal/contracts";

let tempRoot: string;

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
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

async function createPluginDir(
  root: string,
  name: string,
  manifest: unknown,
  options: { createEntry?: boolean; rawManifest?: string } = {}
) {
  const pluginDir = path.join(root, name);
  await mkdir(path.join(pluginDir, "dist"), { recursive: true });
  await writeFile(
    path.join(pluginDir, "plugin.json"),
    options.rawManifest ?? JSON.stringify(manifest, null, 2)
  );
  if (options.createEntry ?? true) {
    await writeFile(path.join(pluginDir, "dist", "index.js"), "export {};\n");
  }
  return pluginDir;
}

describe("PluginDiscovery", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(process.cwd(), ".tmp-plugin-discovery-"));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("discovers a root that is itself a plugin directory", async () => {
    const pluginDir = await createPluginDir(
      tempRoot,
      "agent-plugin",
      makeManifest()
    );
    const discovery = new PluginDiscovery({ roots: [pluginDir] });

    const result = await discovery.discover();

    expect(result.failed).toEqual([]);
    expect(result.discovered).toHaveLength(1);
    expect(result.discovered[0]?.manifest.id).toBe("local.agent-plugin");
    expect(result.discovered[0]?.source.kind).toBe("local-directory");
    expect(result.discovered[0]?.source.rootPath).toBe(pluginDir);
  });

  it("scans child directories containing plugin.json", async () => {
    await createPluginDir(
      tempRoot,
      "agent-plugin",
      makeManifest({
        id: "local.agent-plugin",
        extensionPoints: [
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
          }
        ]
      })
    );
    await createPluginDir(
      tempRoot,
      "workflow-plugin",
      makeManifest({
        id: "local.workflow-plugin",
        extensionPoints: [
          {
            type: "workflow-step-provider",
            id: "local.workflow-plugin.provider",
            providerId: "workflow-provider",
            stepTypes: ["deployment"],
            description: "Adds deployment workflow steps.",
            configSchema: {}
          }
        ]
      })
    );

    const result = await new PluginDiscovery({ roots: [tempRoot] }).discover();

    expect(result.failed).toEqual([]);
    expect(result.discovered.map((item) => item.manifest.id).sort()).toEqual([
      "local.agent-plugin",
      "local.workflow-plugin"
    ]);
  });

  it("reports missing roots without throwing", async () => {
    const result = await new PluginDiscovery({
      roots: [path.join(tempRoot, "missing")]
    }).discover();

    expect(result.discovered).toEqual([]);
    expect(result.failed[0]?.diagnostic.code).toBe("PLUGIN_ROOT_NOT_FOUND");
  });

  it("reports invalid JSON manifests", async () => {
    await createPluginDir(tempRoot, "bad-json", {}, { rawManifest: "{" });

    const result = await new PluginDiscovery({ roots: [tempRoot] }).discover();

    expect(result.discovered).toEqual([]);
    expect(result.failed[0]?.diagnostic.code).toBe(
      "PLUGIN_MANIFEST_JSON_INVALID"
    );
  });

  it("reports schema-invalid manifests", async () => {
    await createPluginDir(tempRoot, "invalid", {
      id: "local.invalid-plugin"
    });

    const result = await new PluginDiscovery({ roots: [tempRoot] }).discover();

    expect(result.discovered).toEqual([]);
    expect(result.failed[0]?.diagnostic.code).toBe("PLUGIN_MANIFEST_INVALID");
  });

  it("reports duplicate plugin ids in one discovery pass", async () => {
    await createPluginDir(
      tempRoot,
      "agent-plugin-a",
      makeManifest({ id: "local.duplicate-plugin" })
    );
    await createPluginDir(
      tempRoot,
      "agent-plugin-b",
      makeManifest({ id: "local.duplicate-plugin" })
    );

    const result = await new PluginDiscovery({ roots: [tempRoot] }).discover();

    expect(result.discovered).toHaveLength(1);
    expect(result.failed[0]?.pluginId).toBe("local.duplicate-plugin");
    expect(result.failed[0]?.diagnostic.code).toBe("PLUGIN_DUPLICATE_ID");
  });

  it("rejects absolute entry module paths", async () => {
    await createPluginDir(
      tempRoot,
      "absolute-entry",
      makeManifest({ entry: { module: "/tmp/plugin.js" } })
    );

    const result = await new PluginDiscovery({ roots: [tempRoot] }).discover();

    expect(result.discovered).toEqual([]);
    expect(result.failed[0]?.diagnostic.code).toBe("PLUGIN_ENTRY_UNSAFE");
  });

  it("rejects entry module paths containing parent traversal", async () => {
    await createPluginDir(
      tempRoot,
      "unsafe-entry",
      makeManifest({ entry: { module: "../plugin.js" } })
    );

    const result = await new PluginDiscovery({ roots: [tempRoot] }).discover();

    expect(result.discovered).toEqual([]);
    expect(result.failed[0]?.diagnostic.code).toBe("PLUGIN_ENTRY_UNSAFE");
  });

  it("reports missing entry module files", async () => {
    await createPluginDir(
      tempRoot,
      "missing-entry",
      makeManifest({ id: "local.missing-entry" }),
      { createEntry: false }
    );

    const result = await new PluginDiscovery({ roots: [tempRoot] }).discover();

    expect(result.discovered).toEqual([]);
    expect(result.failed[0]?.pluginId).toBe("local.missing-entry");
    expect(result.failed[0]?.diagnostic.code).toBe("PLUGIN_ENTRY_NOT_FOUND");
  });
});

