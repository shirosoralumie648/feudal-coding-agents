import Fastify from "fastify";
import { defaultOrchestratorService } from "./config";
import { registerAgentRoutes } from "./routes/agents";
import { registerTaskRoutes } from "./routes/tasks";

const app = Fastify({ logger: true });

registerAgentRoutes(app, defaultOrchestratorService);
registerTaskRoutes(app, defaultOrchestratorService);

const port = Number(process.env.PORT ?? 4000);

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
