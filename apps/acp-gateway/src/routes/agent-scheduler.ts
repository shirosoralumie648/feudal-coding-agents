import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BottleneckAnalyzer } from "../agent-scheduler/bottleneck-analyzer";
import type { AgentScheduler } from "../agent-scheduler/scheduler";
import { TaskAssignmentRequestSchema } from "../agent-scheduler/types";

export interface AgentSchedulerRouteOptions {
  scheduler: AgentScheduler;
  analyzer: BottleneckAnalyzer;
}

export function registerAgentSchedulerRoutes(
  app: FastifyInstance,
  options: AgentSchedulerRouteOptions
) {
  app.post("/agent-scheduler/assign", async (request, reply) => {
    const parsed = TaskAssignmentRequestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({
        message: "Invalid assignment payload",
        issues: parsed.error.issues
      });
    }

    const result = options.scheduler.assignTask(parsed.data);
    if (!result.success) {
      return reply.code(409).send(result.assignment);
    }

    return reply.code(201).send(result.assignment);
  });

  app.get("/agent-scheduler/assignments", async () => {
    return options.scheduler.getAssignments();
  });

  app.get("/agent-scheduler/loads", async () => {
    return options.scheduler.getAgentLoads();
  });

  app.get("/agent-scheduler/bottlenecks", async () => {
    return options.analyzer.analyze();
  });

  app.post("/agent-scheduler/:assignmentId/release", async (request, reply) => {
    const params = z.object({ assignmentId: z.string().min(1) }).parse(request.params);
    const assignment = options.scheduler.releaseAssignment(params.assignmentId);

    if (!assignment) {
      return reply
        .code(404)
        .send({ message: `Assignment "${params.assignmentId}" not found` });
    }

    return assignment;
  });
}
