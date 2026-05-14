import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createJsonRpcRequest } from "../agent-protocol/json-rpc";
import { AgentMessageRouter } from "../agent-protocol/message-router";

const MessageBodySchema = z.object({
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  from: z.string().min(1)
});

export interface AgentMessagingRouteOptions {
  router: AgentMessageRouter;
}

export function registerAgentMessagingRoutes(
  app: FastifyInstance,
  options: AgentMessagingRouteOptions
) {
  app.post("/agents/:agentId/messages", async (request) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);
    const body = MessageBodySchema.parse(request.body);
    const message = createJsonRpcRequest({
      method: body.method,
      params: body.params,
      from: body.from,
      to: params.agentId
    });
    const result = await options.router.send(message);

    return {
      messageId: result.messageId,
      status: result.delivered ? "delivered" : "failed"
    };
  });

  app.post("/agents/broadcast", async (request) => {
    const body = MessageBodySchema.parse(request.body);
    const result = await options.router.broadcast(body);

    return {
      messageId: result.messageId,
      deliveredTo: result.deliveredTo
    };
  });

  app.post("/agents/capability/:capability/messages", async (request) => {
    const params = z.object({ capability: z.string().min(1) }).parse(request.params);
    const body = MessageBodySchema.parse(request.body);
    const result = await options.router.sendByCapability({
      capability: params.capability,
      method: body.method,
      params: body.params,
      from: body.from
    });

    return {
      messageId: result.messageId,
      matchedAgents: result.deliveredTo
    };
  });

  app.get("/agents/:agentId/messages", async (request) => {
    const params = z.object({ agentId: z.string().min(1) }).parse(request.params);
    const query = z.object({ since: z.string().optional() }).parse(request.query);

    return options.router.getPendingMessages(params.agentId, query.since);
  });
}
