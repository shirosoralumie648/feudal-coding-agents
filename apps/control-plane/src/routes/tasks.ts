import type { FastifyInstance } from "fastify";
import { TaskSpecSchema } from "@feudal/contracts";
import { z } from "zod";
import { defaultOrchestratorService } from "../config";
import type { OrchestratorService } from "../services/orchestrator-service";

export function registerTaskRoutes(
  app: FastifyInstance,
  service: OrchestratorService = defaultOrchestratorService
) {
  app.get("/api/tasks", async () => service.listTasks());

  app.get("/api/tasks/:taskId", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
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
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = await service.getTask(params.taskId);

    if (!task) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return service.approveTask(params.taskId);
  });
}
