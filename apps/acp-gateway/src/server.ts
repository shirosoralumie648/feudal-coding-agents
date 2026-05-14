import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import {
  createPostgresEventStore,
  createPostgresPool,
  runMigrations
} from "@feudal/persistence";
import { AgentDiscoveryService } from "./agent-registry/discovery";
import { AgentRegistry } from "./agent-registry/registry";
import { acpManifestToRegistryManifest } from "./agent-registry/seed";
import { BottleneckAnalyzer } from "./agent-scheduler/bottleneck-analyzer";
import { AgentScheduler } from "./agent-scheduler/scheduler";
import { HeartbeatMonitor } from "./agent-health/heartbeat-monitor";
import { FailoverHandler } from "./agent-health/failover-handler";
import { AgentMessageRouter } from "./agent-protocol/message-router";
import { manifests } from "./manifests";
import { registerAgentRoutes } from "./routes/agents";
import { registerAgentHealthRoutes } from "./routes/agent-health";
import { registerAgentMessagingRoutes } from "./routes/agent-messaging";
import { registerAgentRegistryRoutes } from "./routes/agent-registry";
import { registerAgentSchedulerRoutes } from "./routes/agent-scheduler";
import { registerRunRoutes } from "./routes/runs";
import { createRunReadModel } from "./persistence/run-read-model";
import { GatewayStore, type GatewayRunStore } from "./store";
import { createCodexExecRunner } from "./codex/exec";
import { createWorkerRunner } from "./workers/worker-runner";
import type { CodexRunner } from "./workers/types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function createGatewayStoreFromEnv() {
  if (!process.env.DATABASE_URL) {
    return new GatewayStore();
  }

  const pool = createPostgresPool();
  await runMigrations(pool);
  const eventStore = createPostgresEventStore({ pool });
  return createRunReadModel({ eventStore });
}

function createLazyGatewayStore(
  loadStore: () => Promise<GatewayRunStore> = createGatewayStoreFromEnv
): GatewayRunStore {
  let storePromise: Promise<GatewayRunStore> | undefined;

  const getStore = () => {
    storePromise ??= loadStore().catch((error) => {
      storePromise = undefined;
      throw error;
    });
    return storePromise;
  };

  return {
    async getRun(runId) {
      return (await getStore()).getRun(runId);
    },

    async rebuildProjectionsIfNeeded() {
      await (await getStore()).rebuildProjectionsIfNeeded();
    },

    async saveRun(run, eventType, expectedVersion) {
      return (await getStore()).saveRun(run, eventType, expectedVersion);
    }
  };
}

export function createGatewayApp(options?: {
  codexRunner?: CodexRunner;
  logger?: boolean;
  onReady?: () => Promise<void>;
  repoRoot?: string;
  store?: GatewayRunStore;
}) {
  const app = Fastify({ logger: options?.logger ?? true });
  const store = options?.store ?? createLazyGatewayStore();
  const codexRunner =
    options?.codexRunner ??
    createCodexExecRunner({ repoRoot: options?.repoRoot ?? repoRoot });
  const workerRunner = createWorkerRunner({ codexRunner });
  const registry = new AgentRegistry();
  const discovery = new AgentDiscoveryService(registry);
  const messageRouter = new AgentMessageRouter({ registry });
  const heartbeatMonitor = new HeartbeatMonitor({
    registry,
    router: messageRouter,
    config: {
      intervalMs: 30000,
      timeoutMs: 30000,
      maxMissedHeartbeats: 3
    }
  });
  const failoverHandler = new FailoverHandler({
    monitor: heartbeatMonitor,
    registry,
    discovery
  });
  const scheduler = new AgentScheduler({
    registry,
    discovery,
    monitor: heartbeatMonitor
  });
  const bottleneckAnalyzer = new BottleneckAnalyzer({
    registry,
    monitor: heartbeatMonitor,
    scheduler
  });

  registerAgentRoutes(app);
  registerAgentRegistryRoutes(app, { registry, discovery });
  registerAgentMessagingRoutes(app, { router: messageRouter });
  registerAgentHealthRoutes(app, {
    monitor: heartbeatMonitor,
    failoverHandler
  });
  registerAgentSchedulerRoutes(app, {
    scheduler,
    analyzer: bottleneckAnalyzer
  });
  registerRunRoutes(app, {
    store,
    runAgent: (payload) =>
      workerRunner.runAgent({
        agent: payload.agent,
        messages: payload.messages
      })
  });

  app.addHook("onReady", async () => {
    if (registry.listAgents().length === 0) {
      for (const manifest of manifests) {
        await registry.register(acpManifestToRegistryManifest(manifest));
      }
    }
    heartbeatMonitor.startMonitoring();
    await store.rebuildProjectionsIfNeeded();
    await options?.onReady?.();
  });

  app.addHook("onClose", async () => {
    heartbeatMonitor.stopMonitoring();
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createGatewayApp();
  const port = Number(process.env.PORT ?? 4100);

  app.listen({ host: "0.0.0.0", port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
