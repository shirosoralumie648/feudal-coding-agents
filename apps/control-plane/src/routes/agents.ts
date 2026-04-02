import type { FastifyInstance } from "fastify";
import { listAgents } from "../services/orchestrator-service";

export function registerAgentRoutes(app: FastifyInstance) {
  app.get("/api/agents", async () => listAgents());
}
