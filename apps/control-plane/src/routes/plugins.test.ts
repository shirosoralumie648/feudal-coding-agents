import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { PluginDiscoveryResult } from "../services/plugin-discovery";
import { MemoryPluginStore } from "../services/plugin-store";
import type { PluginStore } from "../services/plugin-store";
import { registerPluginRoutes } from "./plugins";
import type { PluginManifest } from "@feudal/contracts";

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

function fakeDiscovery(result: PluginDiscoveryResult) {
  return {
    async discover() {
      return result;
    }
  };
}

function createApp(options?: {
  store?: PluginStore;
  discoveryResult?: PluginDiscoveryResult;
}) {
  const app = Fastify();
  registerPluginRoutes(app, {
    store: options?.store ?? new MemoryPluginStore(),
    discovery: fakeDiscovery(
      options?.discoveryResult ?? { discovered: [], failed: [] }
    ) as never
  });
  return app;
}

describe("plugin routes", () => {
  it("GET /api/plugins returns plugin records and filters by state", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest({ enabledByDefault: true }),
      source: { kind: "inline" }
    });
    await store.registerDiscovered({
      manifest: makeManifest({ id: "local.disabled-plugin" }),
      source: { kind: "inline" }
    });
    const app = createApp({ store });

    const all = await app.inject({ method: "GET", url: "/api/plugins" });
    const enabled = await app.inject({
      method: "GET",
      url: "/api/plugins?state=enabled"
    });

    expect(all.statusCode).toBe(200);
    expect(all.json()).toHaveLength(2);
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toHaveLength(1);
  });

  it("GET /api/plugins rejects invalid lifecycle state filters", async () => {
    const response = await createApp().inject({
      method: "GET",
      url: "/api/plugins?state=installed"
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/plugins/:pluginId returns records or 404", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest(),
      source: { kind: "inline" }
    });
    const app = createApp({ store });

    const found = await app.inject({
      method: "GET",
      url: "/api/plugins/local.agent-plugin"
    });
    const missing = await app.inject({
      method: "GET",
      url: "/api/plugins/local.missing-plugin"
    });

    expect(found.statusCode).toBe(200);
    expect(found.json().manifest.id).toBe("local.agent-plugin");
    expect(missing.statusCode).toBe(404);
    expect(missing.json().message).toBe("Plugin not found");
  });

  it("GET /api/plugins/:pluginId/status returns lifecycle status", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest({ enabledByDefault: true }),
      source: { kind: "inline" }
    });
    const app = createApp({ store });

    const response = await app.inject({
      method: "GET",
      url: "/api/plugins/local.agent-plugin/status"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      pluginId: "local.agent-plugin",
      state: "enabled"
    });
  });

  it("GET /api/plugins/:pluginId/history returns lifecycle events", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest(),
      source: { kind: "inline" }
    });
    await store.enablePlugin("local.agent-plugin");
    const app = createApp({ store });

    const response = await app.inject({
      method: "GET",
      url: "/api/plugins/local.agent-plugin/history"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((event: { eventType: string }) => event.eventType)).toEqual([
      "plugin.registered",
      "plugin.enabled"
    ]);
  });

  it("GET /api/plugins/extensions/enabled returns enabled extension declarations", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest({ enabledByDefault: true }),
      source: { kind: "inline" }
    });
    const app = createApp({ store });

    const response = await app.inject({
      method: "GET",
      url: "/api/plugins/extensions/enabled"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().acpWorkers).toHaveLength(1);
    expect(response.json().workflowStepProviders).toHaveLength(0);
  });

  it("POST /api/plugins/discover returns manifests and failures without mutating the store", async () => {
    const store = new MemoryPluginStore();
    const app = createApp({
      store,
      discoveryResult: {
        discovered: [
          {
            manifest: makeManifest(),
            source: { kind: "local-directory", rootPath: "/plugins/local" }
          }
        ],
        failed: [
          {
            diagnostic: {
              code: "PLUGIN_ROOT_NOT_FOUND",
              message: "missing",
              severity: "warning"
            }
          }
        ]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/plugins/discover"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().discovered[0].id).toBe("local.agent-plugin");
    expect(response.json().failed[0].diagnostic.code).toBe(
      "PLUGIN_ROOT_NOT_FOUND"
    );
    expect(await store.listPlugins()).toHaveLength(0);
  });

  it("POST /api/plugins/register validates and stores an inline manifest", async () => {
    const app = createApp();

    const created = await app.inject({
      method: "POST",
      url: "/api/plugins/register",
      payload: makeManifest()
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/plugins/register",
      payload: makeManifest()
    });
    const invalid = await app.inject({
      method: "POST",
      url: "/api/plugins/register",
      payload: { id: "local.invalid-plugin" }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().state).toBe("registered");
    expect(duplicate.statusCode).toBe(409);
    expect(invalid.statusCode).toBe(400);
  });

  it("POST /api/plugins/reload registers new manifests and reloads existing ones", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest({ version: "1.0.0" }),
      source: { kind: "inline" }
    });
    const app = createApp({
      store,
      discoveryResult: {
        discovered: [
          {
            manifest: makeManifest({ version: "1.1.0" }),
            source: { kind: "local-directory", rootPath: "/plugins/local" }
          },
          {
            manifest: makeManifest({ id: "local.new-plugin" }),
            source: { kind: "local-directory", rootPath: "/plugins/new" }
          }
        ],
        failed: []
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/plugins/reload"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reloaded).toHaveLength(2);
    expect((await store.getPlugin("local.agent-plugin"))?.manifest.version).toBe(
      "1.1.0"
    );
    expect(await store.getPlugin("local.new-plugin")).toBeDefined();
  });

  it("POST /api/plugins/:pluginId/enable and disable are reversible", async () => {
    const store = new MemoryPluginStore();
    await store.registerDiscovered({
      manifest: makeManifest(),
      source: { kind: "inline" }
    });
    const app = createApp({ store });

    const enabled = await app.inject({
      method: "POST",
      url: "/api/plugins/local.agent-plugin/enable"
    });
    const disabled = await app.inject({
      method: "POST",
      url: "/api/plugins/local.agent-plugin/disable"
    });

    expect(enabled.statusCode).toBe(200);
    expect(enabled.json().state).toBe("enabled");
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().state).toBe("disabled");
  });

  it("POST /api/plugins/:pluginId/enable fails closed for failed plugins", async () => {
    const store = new MemoryPluginStore();
    await store.markPluginFailed("local.agent-plugin", {
      code: "PLUGIN_MANIFEST_INVALID",
      message: "invalid",
      severity: "error",
      details: { manifest: makeManifest() }
    });
    const app = createApp({ store });

    const response = await app.inject({
      method: "POST",
      url: "/api/plugins/local.agent-plugin/enable"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Cannot enable failed plugin");
  });
});

