import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { defaultOrchestratorService } from "../config";
import {
  ActionNotAllowedError,
  type OrchestratorService
} from "../services/orchestrator-service";

const TaskParamsSchema = z.object({
  taskId: z.string()
});

const OperatorNoteSchema = z.object({
  note: z.string().trim().min(1)
});

const AbandonInputSchema = z.object({
  note: z.string().trim().min(1),
  confirm: z.literal(true)
});

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

async function sendActionResult(
  reply: FastifyReply,
  work: () => Promise<unknown>
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ActionNotAllowedError) {
      return reply.code(409).send({ message: error.message });
    }

    throw error;
  }
}

function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  reply: FastifyReply
) {
  const result = schema.safeParse(body);

  if (!result.success) {
    reply.code(400).send({ message: "Invalid request body" });
    return undefined;
  }

  return result.data;
}

export function registerOperatorActionRoutes(
  app: FastifyInstance,
  service: OrchestratorService = defaultOrchestratorService
) {
  app.post("/api/tasks/:taskId/operator-actions/recover", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    const payload = parseBody(OperatorNoteSchema, request.body, reply);

    if (!payload) {
      return reply;
    }

    return sendActionResult(reply, () =>
      service.recoverTask(params.taskId, payload.note)
    );
  });

  app.post("/api/tasks/:taskId/operator-actions/takeover", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    const payload = parseBody(OperatorNoteSchema, request.body, reply);

    if (!payload) {
      return reply;
    }

    return sendActionResult(reply, () =>
      service.takeoverTask(params.taskId, payload.note)
    );
  });

  app.post("/api/tasks/:taskId/operator-actions/abandon", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    const payload = parseBody(AbandonInputSchema, request.body, reply);

    if (!payload) {
      return reply;
    }

    return sendActionResult(reply, () =>
      service.abandonTask(params.taskId, payload.note, payload.confirm)
    );
  });

  app.get("/api/tasks/:taskId/operator-actions", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    return service.listOperatorActions(params.taskId);
  });

  app.get("/api/operator-actions/summary", async () =>
    service.getOperatorActionSummary()
  );
}
