import type { FastifyInstance } from "fastify";
import { manifests } from "../manifests";

export function registerAgentRoutes(app: FastifyInstance) {
  app.get("/agents", async () => manifests);
}
