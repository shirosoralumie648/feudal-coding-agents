import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import {
  createPostgresEventStore,
  createPostgresPool,
  runMigrations
} from "@feudal/persistence";
import { registerAgentRoutes } from "./routes/agents";
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

    async saveRun(run, eventType, expectedVersion) {
      return (await getStore()).saveRun(run, eventType, expectedVersion);
    }
  };
}

export function createGatewayApp(options?: {
  codexRunner?: CodexRunner;
  logger?: boolean;
  repoRoot?: string;
  store?: GatewayRunStore;
}) {
  const app = Fastify({ logger: options?.logger ?? true });
  const store = options?.store ?? createLazyGatewayStore();
  const codexRunner =
    options?.codexRunner ??
    createCodexExecRunner({ repoRoot: options?.repoRoot ?? repoRoot });
  const workerRunner = createWorkerRunner({ codexRunner });

  registerAgentRoutes(app);
  registerRunRoutes(app, {
    store,
    runAgent: (payload) =>
      workerRunner.runAgent({
        agent: payload.agent,
        messages: payload.messages
      })
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
