import type { FastifyInstance, FastifyReply } from "fastify";
import { TaskActionSchema, TaskSpecSchema, type TaskAction } from "@feudal/contracts";
import { z } from "zod";
import { defaultOrchestratorService } from "../config";
import {
  ActionNotAllowedError,
  type OrchestratorService
} from "../services/orchestrator-service";

const TaskParamsSchema = z.object({
  taskId: z.string()
});

const TaskGovernanceActionParamsSchema = z.object({
  taskId: z.string(),
  actionType: TaskActionSchema
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

function parseRevisionNote(
  actionType: TaskAction,
  body: unknown,
  reply: FastifyReply
): string | undefined {
  if (actionType !== "revise") {
    return undefined;
  }

  const payload = RevisionInputSchema.safeParse(body);

  if (!payload.success) {
    reply.code(400).send({ message: "Revision note must not be empty" });
    return undefined;
  }

  return payload.data.note;
}

async function submitGovernanceActionRoute(options: {
  service: OrchestratorService;
  taskId: string;
  actionType: TaskAction;
  body: unknown;
  reply: FastifyReply;
}) {
  const task = await ensureTaskExists(options.service, options.taskId, options.reply);

  if (!task) {
    return options.reply;
  }

  const note = parseRevisionNote(options.actionType, options.body, options.reply);

  if (options.actionType === "revise" && typeof note === "undefined") {
    return options.reply;
  }

  return sendActionResult(options.reply, () =>
    options.service.submitGovernanceAction(options.taskId, options.actionType, note)
  );
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

  app.post(
    "/api/tasks/:taskId/governance-actions/:actionType",
    async (request, reply) => {
      const params = TaskGovernanceActionParamsSchema.safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Invalid governance action type" });
      }

      return submitGovernanceActionRoute({
        service,
        taskId: params.data.taskId,
        actionType: params.data.actionType,
        body: request.body,
        reply
      });
    }
  );

  app.post("/api/tasks/:taskId/approve", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);

    return submitGovernanceActionRoute({
      service,
      taskId: params.taskId,
      actionType: "approve",
      body: request.body,
      reply
    });
  });

  app.post("/api/tasks/:taskId/reject", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);

    return submitGovernanceActionRoute({
      service,
      taskId: params.taskId,
      actionType: "reject",
      body: request.body,
      reply
    });
  });

  app.post("/api/tasks/:taskId/revise", async (request, reply) => {
    const params = TaskParamsSchema.parse(request.params);

    return submitGovernanceActionRoute({
      service,
      taskId: params.taskId,
      actionType: "revise",
      body: request.body,
      reply
    });
  });
}
