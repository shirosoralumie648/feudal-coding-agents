import type { FastifyInstance, FastifyReply } from "fastify";
import { TaskSpecSchema } from "@feudal/contracts";
import { z } from "zod";
import { defaultOrchestratorService } from "../config";
import {
  ActionNotAllowedError,
  type OrchestratorService
} from "../services/orchestrator-service";

const TaskParamsSchema = z.object({
  taskId: z.string()
});

const RevisionInputSchema = z.object({
  note: z.string().trim().min(1)
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

export function registerTaskRoutes(
  app: FastifyInstance,
  service: OrchestratorService = defaultOrchestratorService
) {
  app.get("/api/tasks", async () => service.listTasks());

  app.get("/api/tasks/:taskId", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await service.getTask(params.taskId);

    if (!task) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return task;
  });

  app.post("/api/tasks", async (request, reply) => {
    const payload = TaskSpecSchema.parse({
      id: crypto.randomUUID(),
      ...request.body
    });

    const projection = await service.createTask(payload);
    return reply.code(201).send(projection);
  });

  app.post("/api/tasks/:taskId/approve", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    return sendActionResult(reply, () => service.approveTask(params.taskId));
  });

  app.post("/api/tasks/:taskId/reject", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    return sendActionResult(reply, () => service.rejectTask(params.taskId));
  });

  app.post("/api/tasks/:taskId/revise", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);
    const task = await ensureTaskExists(service, params.taskId, reply);

    if (!task) {
      return reply;
    }

    const payload = RevisionInputSchema.parse(request.body);
    return sendActionResult(reply, () =>
      service.submitRevision(params.taskId, payload.note)
    );
  });
}
