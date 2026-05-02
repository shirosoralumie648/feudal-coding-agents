import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  EnabledPluginExtensionsSchema,
  PluginLifecycleStateSchema,
  PluginManifestSchema
} from "@feudal/contracts";
import { PluginDiscovery } from "../services/plugin-discovery";
import type { PluginDiscoveryResult } from "../services/plugin-discovery";
import {
  MemoryPluginStore,
  type PluginStore
} from "../services/plugin-store";

const PluginParams = z.object({ pluginId: z.string().min(1) });
const ListPluginsQuery = z.object({ state: z.string().optional() });

function parseOrReply<T>(
  schema: z.ZodType<T>,
  input: unknown,
  reply: FastifyReply
): T | undefined {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    reply.code(400).send({
      message: parsed.error.issues[0]?.message ?? "Invalid request"
    });
    return undefined;
  }
  return parsed.data;
}

function handlePluginError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      message: error.issues[0]?.message ?? "Invalid request"
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("already exists")) {
    return reply.code(409).send({ message });
  }
  if (message.includes("not found")) {
    return reply.code(404).send({ message });
  }
  if (message.includes("Cannot enable failed plugin")) {
    return reply.code(400).send({ message });
  }
  if (message.includes("id mismatch")) {
    return reply.code(400).send({ message });
  }

  throw error;
}

export function registerPluginRoutes(
  app: FastifyInstance,
  options?: {
    store?: PluginStore;
    discovery?: PluginDiscovery;
  }
) {
  const store = options?.store ?? new MemoryPluginStore();
  const discovery =
    options?.discovery ?? new PluginDiscovery({ roots: ["plugins"] });

  app.get("/api/plugins", async (request, reply) => {
    const query = parseOrReply(ListPluginsQuery, request.query ?? {}, reply);
    if (!query) return reply;

    if (!query.state) {
      return store.listPlugins();
    }

    const parsedState = parseOrReply(
      PluginLifecycleStateSchema,
      query.state,
      reply
    );
    if (!parsedState) return reply;

    return store.listPlugins({ state: parsedState });
  });

  app.get("/api/plugins/extensions/enabled", async () => {
    return EnabledPluginExtensionsSchema.parse(
      await store.listEnabledExtensions()
    );
  });

  app.get("/api/plugins/:pluginId/status", async (request, reply) => {
    const params = parseOrReply(PluginParams, request.params, reply);
    if (!params) return reply;

    const plugin = await store.getPlugin(params.pluginId);
    if (!plugin) {
      return reply.code(404).send({ message: "Plugin not found" });
    }

    return {
      pluginId: params.pluginId,
      state: plugin.state,
      diagnostics: plugin.diagnostics,
      updatedAt: plugin.updatedAt,
      enabledAt: plugin.enabledAt,
      disabledAt: plugin.disabledAt,
      lastReloadedAt: plugin.lastReloadedAt
    };
  });

  app.get("/api/plugins/:pluginId/history", async (request, reply) => {
    const params = parseOrReply(PluginParams, request.params, reply);
    if (!params) return reply;

    return store.getPluginLifecycleHistory(params.pluginId);
  });

  app.get("/api/plugins/:pluginId", async (request, reply) => {
    const params = parseOrReply(PluginParams, request.params, reply);
    if (!params) return reply;

    const plugin = await store.getPlugin(params.pluginId);
    if (!plugin) {
      return reply.code(404).send({ message: "Plugin not found" });
    }

    return plugin;
  });

  app.post("/api/plugins/discover", async () => {
    const result = await discovery.discover();
    return {
      discovered: result.discovered.map((item) => item.manifest),
      failed: result.failed
    };
  });

  app.post("/api/plugins/register", async (request, reply) => {
    const manifest = parseOrReply(PluginManifestSchema, request.body, reply);
    if (!manifest) return reply;

    try {
      const record = await store.registerDiscovered({
        manifest,
        source: { kind: "inline" }
      });
      return reply.code(201).send(record);
    } catch (error) {
      return handlePluginError(error, reply);
    }
  });

  app.post("/api/plugins/reload", async (_request, reply) => {
    try {
      const result = await discovery.discover();
      const reloaded = [];

      for (const item of result.discovered) {
        const existing = await store.getPlugin(item.manifest.id);
        reloaded.push(
          existing
            ? await store.reloadPlugin(item.manifest.id, item.manifest)
            : await store.registerDiscovered(item)
        );
      }

      return {
        reloaded,
        failed: result.failed
      } satisfies {
        reloaded: Awaited<ReturnType<PluginStore["listPlugins"]>>;
        failed: PluginDiscoveryResult["failed"];
      };
    } catch (error) {
      return handlePluginError(error, reply);
    }
  });

  app.post("/api/plugins/:pluginId/enable", async (request, reply) => {
    const params = parseOrReply(PluginParams, request.params, reply);
    if (!params) return reply;

    try {
      return await store.enablePlugin(params.pluginId);
    } catch (error) {
      return handlePluginError(error, reply);
    }
  });

  app.post("/api/plugins/:pluginId/disable", async (request, reply) => {
    const params = parseOrReply(PluginParams, request.params, reply);
    if (!params) return reply;

    try {
      return await store.disablePlugin(params.pluginId);
    } catch (error) {
      return handlePluginError(error, reply);
    }
  });
}

