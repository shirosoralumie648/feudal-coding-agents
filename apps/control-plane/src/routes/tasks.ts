import type { FastifyInstance } from "fastify";
import { TaskSpecSchema } from "@feudal/contracts";
import { z } from "zod";
import {
  approveTask,
  createTask,
  getTask,
  listTasks
} from "../services/orchestrator-service";

export function registerTaskRoutes(app: FastifyInstance) {
  app.get("/api/tasks", async () => listTasks());

  app.get("/api/tasks/:taskId", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = getTask(params.taskId);

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

    const task = await createTask(payload);
    return reply.code(201).send(task);
  });

  app.post("/api/tasks/:taskId/approve", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = getTask(params.taskId);

    if (!task) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return approveTask(params.taskId);
  });
}
