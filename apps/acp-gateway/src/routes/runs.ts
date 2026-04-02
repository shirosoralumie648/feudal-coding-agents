import { randomUUID } from "node:crypto";
import type { ACPMessage } from "@feudal/acp";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GatewayStore, type GatewayRunRecord } from "../store";
import { gatewayWorkerNames, type GatewayWorkerName } from "../workers/types";

const MessageRoleSchema = z.union([
  z.literal("user"),
  z.string().regex(/^agent\/.+/)
]);

const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string()
});

const RunCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("await"),
    label: z.string(),
    prompt: z.string(),
    actions: z.array(z.string()).min(1)
  }),
  z.object({
    kind: z.literal("agent-run"),
    agent: z.enum(gatewayWorkerNames),
    messages: z.array(MessageSchema)
  })
]);

const AwaitResponseSchema = z.object({
  role: z.literal("user"),
  content: z.string().min(1)
});

type AgentRunPayload = Extract<z.infer<typeof RunCreateSchema>, { kind: "agent-run" }>;

export function registerRunRoutes(
  app: FastifyInstance,
  options?: {
    store?: GatewayStore;
    runAgent?: (payload: AgentRunPayload) => Promise<GatewayRunRecord>;
  }
) {
  const store = options?.store ?? new GatewayStore();

  app.post("/runs", async (request, reply) => {
    const payloadResult = RunCreateSchema.safeParse(request.body);

    if (!payloadResult.success) {
      return reply.code(400).send({
        message: "Invalid run payload",
        issues: payloadResult.error.issues
      });
    }

    const payload = payloadResult.data;

    if (payload.kind === "await") {
      const run = store.saveRun({
        id: randomUUID(),
        agent: payload.label,
        status: "awaiting",
        messages: [],
        artifacts: [],
        awaitPrompt: payload.prompt,
        allowedActions: payload.actions
      });

      return reply.code(201).send(run);
    }

    if (!options?.runAgent) {
      return reply.code(400).send({ message: "Unsupported run kind: agent-run" });
    }

    try {
      const run = await options.runAgent(payload);
      store.saveRun(run);
      return reply.code(201).send(run);
    } catch {
      const failedRun = store.saveRun({
        id: randomUUID(),
        agent: payload.agent,
        status: "failed",
        messages: payload.messages,
        artifacts: []
      });

      return reply.code(201).send(failedRun);
    }
  });

  app.get("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const run = store.getRun(params.runId);

    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return run;
  });

  app.post("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const responseResult = AwaitResponseSchema.safeParse(request.body);
    const run = store.getRun(params.runId);

    if (!responseResult.success) {
      return reply.code(400).send({
        message: "Invalid await response payload",
        issues: responseResult.error.issues
      });
    }

    const response = responseResult.data;

    if (!run || run.status !== "awaiting") {
      return reply.code(409).send({ message: "Run is not awaiting input" });
    }

    if (run.allowedActions && !run.allowedActions.includes(response.content)) {
      return reply
        .code(400)
        .send({ message: `Unsupported approval action: ${response.content}` });
    }

    const resumed = store.saveRun({
      ...run,
      status: "completed",
      messages: [...run.messages, response as ACPMessage]
    });

    return resumed;
  });
}
