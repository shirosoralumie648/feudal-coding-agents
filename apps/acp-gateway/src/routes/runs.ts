import { randomUUID } from "node:crypto";
import type { ACPMessage } from "@feudal/acp";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GatewayStore, type GatewayRunRecord, type GatewayRunStore } from "../store";
import { gatewayWorkerNames, type GatewayWorkerName } from "../workers/types";

const MessageRoleSchema = z.union([
  z.literal("user"),
  z.string().regex(/^agent\/.+/)
]);

const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string()
});

const RunMetadataSchema = z
  .object({
    taskId: z.string().optional()
  })
  .strict();

const RunCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("await"),
    label: z.string(),
    prompt: z.string(),
    actions: z.array(z.string()).min(1),
    metadata: RunMetadataSchema.optional()
  }),
  z.object({
    kind: z.literal("agent-run"),
    agent: z.enum(gatewayWorkerNames),
    messages: z.array(MessageSchema),
    metadata: RunMetadataSchema.optional()
  })
]);

const AwaitResponseSchema = z.object({
  role: z.literal("user"),
  content: z.string().min(1)
});

type AgentRunPayload = Extract<z.infer<typeof RunCreateSchema>, { kind: "agent-run" }>;
type TypedAgentRunPayload = Omit<AgentRunPayload, "messages"> & {
  messages: ACPMessage[];
};

function toACPMessages(messages: AgentRunPayload["messages"]): ACPMessage[] {
  return messages.map((message) => ({
    role: message.role as ACPMessage["role"],
    content: message.content
  }));
}

function isRunVersionMismatch(error: unknown) {
  return error instanceof Error && error.message.startsWith("Event version mismatch for run:");
}

function phaseForRunAgent(agent: GatewayWorkerName) {
  if (agent === "intake-agent") {
    return "intake" as const;
  }

  if (agent === "analyst-agent" || agent === "fact-checker-agent") {
    return "planning" as const;
  }

  if (agent === "auditor-agent" || agent === "critic-agent") {
    return "review" as const;
  }

  if (agent === "gongbu-executor") {
    return "execution" as const;
  }

  return "verification" as const;
}

export function registerRunRoutes(
  app: FastifyInstance,
  options?: {
    store?: GatewayRunStore;
    runAgent?: (payload: TypedAgentRunPayload) => Promise<GatewayRunRecord>;
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
      const run = await store.saveRun(
        {
          id: randomUUID(),
          taskId: payload.metadata?.taskId,
          agent: payload.label,
          status: "awaiting",
          phase: "approval",
          messages: [],
          artifacts: [],
          awaitPrompt: payload.prompt,
          allowedActions: payload.actions
        },
        "run.created",
        0
      );

      return reply.code(201).send(run);
    }

    if (!options?.runAgent) {
      return reply.code(400).send({ message: "Unsupported run kind: agent-run" });
    }

    const runId = randomUUID();
    const messages = toACPMessages(payload.messages);
    const initialRun = await store.saveRun(
      {
        id: runId,
        taskId: payload.metadata?.taskId,
        agent: payload.agent,
        status: "created",
        phase: phaseForRunAgent(payload.agent),
        messages,
        artifacts: []
      },
      "run.created",
      0
    );
    const inProgressRun = await store.saveRun(
      {
        ...initialRun,
        status: "in-progress",
        messages,
        artifacts: []
      },
      "run.in-progress",
      initialRun.latestProjectionVersion
    );

    let run: GatewayRunRecord;

    try {
      run = await options.runAgent({ ...payload, messages });
    } catch {
      const failedRun = await store.saveRun(
        {
          ...inProgressRun,
          id: runId,
          taskId: payload.metadata?.taskId,
          agent: payload.agent,
          status: "failed",
          phase: phaseForRunAgent(payload.agent),
          messages,
          artifacts: []
        },
        "run.failed",
        inProgressRun.latestProjectionVersion
      );

      return reply.code(201).send(failedRun);
    }

    const persisted = await store.saveRun(
      {
        ...inProgressRun,
        ...run,
        id: runId,
        taskId: payload.metadata?.taskId ?? run.taskId,
        phase: run.phase ?? phaseForRunAgent(payload.agent)
      },
      `run.${run.status}`,
      inProgressRun.latestProjectionVersion
    );
    return reply.code(201).send(persisted);
  });

  app.get("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const run = await store.getRun(params.runId);

    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return run;
  });

  app.post("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const responseResult = AwaitResponseSchema.safeParse(request.body);
    const run = await store.getRun(params.runId);

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

    try {
      const resumed = await store.saveRun(
        {
          ...run,
          status: "completed",
          messages: [...run.messages, response as ACPMessage]
        },
        "run.status_transitioned",
        run.latestProjectionVersion
      );

      return resumed;
    } catch (error) {
      if (isRunVersionMismatch(error)) {
        return reply.code(409).send({
          message: "Run state changed, retry the request"
        });
      }

      throw error;
    }
  });

  // MB.2: Run cancellation endpoint
  const CancelRequestSchema = z.object({
    reason: z.string().min(1)
  });

  app.post("/runs/:runId/cancel", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const cancelResult = CancelRequestSchema.safeParse(request.body);
    const run = await store.getRun(params.runId);

    if (!cancelResult.success) {
      return reply.code(400).send({
        message: "Invalid cancel request payload",
        issues: cancelResult.error.issues
      });
    }

    const { reason } = cancelResult.data;

    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    // Only allow cancellation from created, in-progress, or awaiting states
    if (!["created", "in-progress", "awaiting"].includes(run.status)) {
      return reply.code(409).send({
        message: `Cannot cancel run in ${run.status} state`
      });
    }

    try {
      // First transition to cancelling state
      const cancellingRun = await store.saveRun(
        {
          ...run,
          status: "cancelling",
          cancellationReason: reason
        },
        "run.cancellation_requested",
        run.latestProjectionVersion
      );

      // Then immediately transition to cancelled state
      const cancelledRun = await store.saveRun(
        {
          ...cancellingRun,
          status: "cancelled"
        },
        "run.cancelled",
        cancellingRun.latestProjectionVersion
      );

      return cancelledRun;
    } catch (error) {
      if (isRunVersionMismatch(error)) {
        return reply.code(409).send({
          message: "Run state changed, retry the request"
        });
      }

      throw error;
    }
  });
}
