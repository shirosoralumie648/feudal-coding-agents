import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { registerAgentRoutes } from "./routes/agents";
import { registerRunRoutes } from "./routes/runs";
import { GatewayStore } from "./store";
import { createCodexExecRunner } from "./codex/exec";
import { createWorkerRunner } from "./workers/worker-runner";
import type { CodexRunner } from "./workers/types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function createGatewayApp(options?: {
  codexRunner?: CodexRunner;
  logger?: boolean;
  repoRoot?: string;
  store?: GatewayStore;
}) {
  const app = Fastify({ logger: options?.logger ?? true });
  const store = options?.store ?? new GatewayStore();
  const codexRunner =
    options?.codexRunner ??
    createCodexExecRunner({ repoRoot: options?.repoRoot ?? repoRoot });
  const workerRunner = createWorkerRunner({ codexRunner });

  registerAgentRoutes(app, store);
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
