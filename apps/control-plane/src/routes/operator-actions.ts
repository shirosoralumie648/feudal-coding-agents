import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { defaultOrchestratorService } from "../config";
import { OperatorActionNotAllowedError } from "../operator-actions/policy";
import type { OrchestratorService } from "../services/orchestrator-service";

const TaskParamsSchema = z.object({
  taskId: z.string()
});

const NoteBodySchema = z.object({
  note: z.string().trim().min(1)
});

const AbandonBodySchema = NoteBodySchema.extend({
  confirm: z.literal(true)
});

function parseOrReply<T>(
  schema: z.ZodType<T>,
  input: unknown,
  reply: FastifyReply
) {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    return undefined;
  }

  return parsed.data;
}

async function ensureTaskExists(
  service: OrchestratorService,
  taskId: string,
  reply: FastifyReply
) {
  const task = await service.getTask(taskId);

  if (!task) {
    reply.code(404).send({ message: "Task not found" });
    return undefined;
  }

  return task;
}

async function sendOperatorResult(
  reply: FastifyReply,
  work: () => Promise<unknown>
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof OperatorActionNotAllowedError) {
      return reply.code(409).send({ message: error.message });
    }

    throw error;
  }
}

export function registerOperatorActionRoutes(
  app: FastifyInstance,
  service: OrchestratorService = defaultOrchestratorService
) {
  app.get("/api/tasks/:taskId/operator-actions", async (request, reply) => {
    const params = parseOrReply(TaskParamsSchema, request.params, reply);

    if (!params) {
      return reply;
    }

    const actions = await service.listOperatorActions(params.taskId);

    if (!actions) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return actions;
  });

  app.get("/api/operator-actions/summary", async () =>
    service.getOperatorActionSummary()
  );

  app.post("/api/tasks/:taskId/operator-actions/recover", async (request, reply) => {
    const params = parseOrReply(TaskParamsSchema, request.params, reply);

    if (!params) {
      return reply;
    }

    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    const payload = parseOrReply(NoteBodySchema, request.body, reply);

    if (!payload) {
      return reply;
    }

    return sendOperatorResult(reply, () =>
      service.recoverTask(params.taskId, payload.note)
    );
  });

  app.post("/api/tasks/:taskId/operator-actions/takeover", async (request, reply) => {
    const params = parseOrReply(TaskParamsSchema, request.params, reply);

    if (!params) {
      return reply;
    }

    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    const payload = parseOrReply(NoteBodySchema, request.body, reply);

    if (!payload) {
      return reply;
    }

    return sendOperatorResult(reply, () =>
      service.takeoverTask(params.taskId, payload.note)
    );
  });

  app.post("/api/tasks/:taskId/operator-actions/abandon", async (request, reply) => {
    const params = parseOrReply(TaskParamsSchema, request.params, reply);

    if (!params) {
      return reply;
    }

    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    const payload = parseOrReply(AbandonBodySchema, request.body, reply);

    if (!payload) {
      return reply;
    }

    return sendOperatorResult(reply, () =>
      service.abandonTask(params.taskId, payload.note)
    );
  });
}
