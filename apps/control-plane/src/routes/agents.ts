import type { FastifyInstance } from "fastify";
import { defaultOrchestratorService } from "../config";
import type { OrchestratorService } from "../services/orchestrator-service";

export function registerAgentRoutes(
  app: FastifyInstance,
  service: OrchestratorService = defaultOrchestratorService
) {
  app.get("/api/agents", async () => service.listAgents());
}
