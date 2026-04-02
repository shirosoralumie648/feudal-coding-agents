import Fastify from "fastify";
import { registerAgentRoutes } from "./routes/agents";
import { registerTaskRoutes } from "./routes/tasks";

const app = Fastify({ logger: true });

registerAgentRoutes(app);
registerTaskRoutes(app);

const port = Number(process.env.PORT ?? 4000);

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
