import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { FailoverHandler } from "../agent-health/failover-handler";
import { HeartbeatMonitor } from "../agent-health/heartbeat-monitor";

const HeartbeatBodySchema = z.object({
  timestamp: z.coerce.date().optional()
});

export interface AgentHealthRouteOptions {
  monitor: HeartbeatMonitor;
  failoverHandler: FailoverHandler;
}

export function registerAgentHealthRoutes(
  app: FastifyInstance,
  options: AgentHealthRouteOptions
) {
  app.post("/agent-health/:agentId/heartbeat", async (request, reply) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);
    const body = HeartbeatBodySchema.parse(request.body ?? {});

    try {
      await options.monitor.recordHeartbeat(params.agentId, body.timestamp);
      return { status: "recorded" };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return reply.code(404).send({ message: error.message });
      }
      throw error;
    }
  });

  app.get("/agent-health/:agentId", async (request, reply) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);
    const health = options.monitor.getAgentHealth(params.agentId);

    if (!health) {
      return reply.code(404).send({ message: `Agent "${params.agentId}" not found` });
    }

    return {
      agentId: health.agentId,
      status: health.status,
      lastHeartbeat: health.lastHeartbeat,
      missedCount: health.missedCount
    };
  });

  app.get("/agent-health", async () => {
    return {
      agents: options.monitor.getAllAgentHealth()
    };
  });

  app.post("/agent-health/:agentId/probe", async (request, reply) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);

    const result = await options.monitor.activeProbe(params.agentId);
    if (result.status === "unknown") {
      return reply.code(404).send({ message: `Agent "${params.agentId}" not found` });
    }

    return {
      status: result.status,
      responseTime: result.responseTimeMs
    };
  });

  app.get("/agent-health/events", async (request) => {
    const query = z
      .object({
        agentId: z.string().optional(),
        since: z.coerce.date().optional()
      })
      .parse(request.query);

    return options.monitor.getEvents({
      agentId: query.agentId,
      since: query.since
    });
  });

  app.post("/agent-health/failover/:agentId", async (request) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);
    return options.failoverHandler.handleFailover(params.agentId);
  });
}
