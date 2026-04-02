import Fastify from "fastify";
import { registerAgentRoutes } from "./routes/agents";
import { registerRunRoutes } from "./routes/runs";

const app = Fastify({ logger: true });

registerAgentRoutes(app);
registerRunRoutes(app);

const port = Number(process.env.PORT ?? 4100);

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
