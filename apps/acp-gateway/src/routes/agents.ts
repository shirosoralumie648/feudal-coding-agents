import type { FastifyInstance } from "fastify";
import { GatewayStore } from "../store";

export function registerAgentRoutes(
  app: FastifyInstance,
  store = new GatewayStore()
) {
  app.get("/agents", async () => store.listAgents());
}
