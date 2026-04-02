import { randomUUID } from "node:crypto";
import type { ACPMessage } from "@feudal/acp";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GatewayStore, type GatewayRunRecord } from "../store";

const MessageSchema = z.object({
  role: z.string(),
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
    agent: z.string(),
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
    const payload = RunCreateSchema.parse(request.body);

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

    const run = await options.runAgent(payload);
    store.saveRun(run);
    return reply.code(201).send(run);
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
    const response = AwaitResponseSchema.parse(request.body);
    const run = store.getRun(params.runId);

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
