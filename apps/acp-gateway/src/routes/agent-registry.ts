import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AgentDiscoveryService } from "../agent-registry/discovery";
import { AgentRegistry } from "../agent-registry/registry";
import { AgentStatusSchema, DiscoveryQuerySchema } from "../agent-registry/types";

const RegisterBodySchema = z.object({
  agentId: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: AgentStatusSchema.optional(),
  isTemporary: z.boolean().optional().default(false)
});

const StatusBodySchema = z.object({
  status: AgentStatusSchema
});

const DiscoveryBodySchema = DiscoveryQuerySchema;

export interface AgentRegistryRouteOptions {
  registry?: AgentRegistry;
  discovery?: AgentDiscoveryService;
}

export function registerAgentRegistryRoutes(
  app: FastifyInstance,
  options?: AgentRegistryRouteOptions
) {
  const registry = options?.registry ?? new AgentRegistry();
  const discovery = options?.discovery ?? new AgentDiscoveryService(registry);

  app.post("/agent-registry/register", async (request, reply) => {
    const body = RegisterBodySchema.parse(request.body);
    const result = await registry.register(
      {
        agentId: body.agentId,
        capabilities: body.capabilities,
        metadata: body.metadata,
        status: body.status,
        isTemporary: body.isTemporary
      },
      { temporary: body.isTemporary }
    );

    if (!result.success) {
      return reply.code(409).send({ message: result.error });
    }

    return reply.code(201).send({
      agentId: result.agentId,
      status: registry.getAgent(result.agentId)?.status ?? "online"
    });
  });

  app.delete("/agent-registry/:agentId", async (request, reply) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);

    try {
      await registry.unregister(params.agentId);
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ message: error.message });
      }
      throw error;
    }
  });

  app.get("/agent-registry/:agentId", async (request, reply) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);
    const agent = registry.getAgent(params.agentId);

    if (!agent) {
      return reply.code(404).send({ message: `Agent "${params.agentId}" not found` });
    }

    return agent;
  });

  app.get("/agent-registry", async (request) => {
    const query = z
      .object({
        status: AgentStatusSchema.optional(),
        capability: z.string().min(1).optional()
      })
      .parse(request.query);

    if (!query.status && !query.capability) {
      return registry.listAgents();
    }

    return discovery.query({
      status: query.status ? [query.status] : undefined,
      capabilityPattern: query.capability
    }).agents;
  });

  app.post("/agent-registry/:agentId/status", async (request, reply) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);
    const body = StatusBodySchema.parse(request.body);

    try {
      await registry.setStatus(params.agentId, body.status);
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ message: error.message });
      }
      throw error;
    }
  });

  app.post("/agent-registry/discover", async (request) => {
    const query = DiscoveryBodySchema.parse(request.body ?? {});
    return discovery.query(query);
  });
}
