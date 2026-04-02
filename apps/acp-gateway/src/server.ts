import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { registerAgentRoutes } from "./routes/agents";
import { registerRunRoutes } from "./routes/runs";
import { GatewayStore } from "./store";
import { createCodexExecRunner } from "./codex/exec";
import { createWorkerRunner } from "./workers/worker-runner";

const app = Fastify({ logger: true });
const store = new GatewayStore();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codexRunner = createCodexExecRunner({ repoRoot });
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

const port = Number(process.env.PORT ?? 4100);

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
