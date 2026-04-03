import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { defaultOrchestratorService } from "../config";
import type { OrchestratorService } from "../services/orchestrator-service";

export function registerReplayRoutes(
  app: FastifyInstance,
  service: OrchestratorService = defaultOrchestratorService
) {
  app.get("/api/tasks/:taskId/events", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const events = await service.listTaskEvents(params.taskId);

    if (!events) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return events;
  });

  app.get("/api/tasks/:taskId/diffs", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const diffs = await service.listTaskDiffs(params.taskId);

    if (!diffs) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return diffs;
  });

  app.get("/api/tasks/:taskId/runs", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const runs = await service.listTaskRuns(params.taskId);

    if (!runs) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return runs;
  });

  app.get("/api/tasks/:taskId/artifacts", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const artifacts = await service.listTaskArtifacts(params.taskId);

    if (!artifacts) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return artifacts;
  });

  app.get("/api/tasks/:taskId/replay", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const query = z
      .object({ asOfEventId: z.coerce.number().int().positive() })
      .parse(request.query);
    const snapshot = await service.replayTaskAtEventId(params.taskId, query.asOfEventId);

    if (!snapshot) {
      return reply.code(404).send({ message: "Replay snapshot not found" });
    }

    return snapshot;
  });

  app.get("/api/recovery/summary", async () => service.getRecoverySummary());
}
