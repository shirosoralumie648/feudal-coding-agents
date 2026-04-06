import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { defaultOrchestratorService } from "./config";
import { registerAgentRoutes } from "./routes/agents";
import { registerOperatorActionRoutes } from "./routes/operator-actions";
import { registerReplayRoutes } from "./routes/replay";
import { registerTaskRoutes } from "./routes/tasks";
import type { OrchestratorService } from "./services/orchestrator-service";

export function createControlPlaneApp(options?: {
  logger?: boolean;
  onReady?: () => Promise<void>;
  service?: OrchestratorService;
}) {
  const app = Fastify({ logger: options?.logger ?? true });
  const service = options?.service ?? defaultOrchestratorService;

  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);
  registerOperatorActionRoutes(app, service);
  registerReplayRoutes(app, service);

  app.addHook("onReady", async () => {
    await service.rebuildProjectionsIfNeeded();
    await options?.onReady?.();
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createControlPlaneApp();
  const port = Number(process.env.PORT ?? 4000);

  app.listen({ host: "0.0.0.0", port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
