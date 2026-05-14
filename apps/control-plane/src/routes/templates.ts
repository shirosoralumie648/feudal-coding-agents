import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  TemplateExportPackageSchema,
  TemplateInstantiationSchema,
  WorkflowTemplateSchema,
  type TemplateStatus,
} from "../services/workflow-template-types";
import type { TemplateStore } from "../services/workflow-template-store";
import type { WorkflowTemplateEngine } from "../services/workflow-template-engine";
import {
  defaultTemplateStore,
  defaultTemplateEngine,
  defaultOrchestratorService,
} from "../config";

// ---- Zod Schemas ----

const TemplateNameParams = z.object({ name: z.string().min(1) });

const CreateTemplateInput = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  parameters: WorkflowTemplateSchema.shape.parameters,
  steps: WorkflowTemplateSchema.shape.steps,
});

const UpdateTemplateInput = z.object({
  version: z.string().min(1).optional(),
  parameters: WorkflowTemplateSchema.shape.parameters.optional(),
  steps: WorkflowTemplateSchema.shape.steps.optional(),
});

const ListQuery = z.object({
  status: z.string().optional(),
});

// ---- Helpers ----

function parseIfMatch(request: { headers: Record<string, string | string[] | undefined> }): number | null {
  const raw = request.headers["if-match"];
  if (raw === undefined) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 1) return null;
  return parsed;
}

function requireIfMatch(
  request: { headers: Record<string, string | string[] | undefined> },
  reply: FastifyReply
): number | undefined {
  const expectedVersion = parseIfMatch(request);
  if (expectedVersion === null) {
    reply.code(400).send({ message: "if-match header with event version is required for updates" });
    return undefined;
  }
  return expectedVersion;
}

function handleStoreError(error: unknown, reply: FastifyReply): FastifyReply {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("already exists")) {
    return reply.code(409).send({ message });
  }
  if (message.includes("Version mismatch") || message.includes("version mismatch")) {
    return reply.code(409).send({ message });
  }
  if (message.includes("not found")) {
    return reply.code(404).send({ message });
  }
  if (
    message.includes("Cannot delete") ||
    message.includes("Cannot export") ||
    message.includes("Cannot instantiate") ||
    message.includes("Cannot unpublish")
  ) {
    return reply.code(400).send({ message });
  }
  if (
    message.includes("already published") ||
    message.includes("not published") ||
    message.includes("already unpublished")
  ) {
    return reply.code(409).send({ message });
  }

  // Unexpected errors
  throw error;
}

function parseOrReply<T>(
  schema: z.ZodType<T>,
  input: unknown,
  reply: FastifyReply
): T | undefined {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    reply.code(400).send({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    return undefined;
  }
  return parsed.data;
}

// ---- Route Registration ----

export function registerTemplateRoutes(
  app: FastifyInstance,
  options?: {
    store?: TemplateStore;
    engine?: WorkflowTemplateEngine;
  }
) {
  const store = options?.store ?? defaultTemplateStore;
  const engine = options?.engine ?? defaultTemplateEngine;
  void engine; // reserved for future engine-based routes

  // 1. POST /api/templates — Create a new template (as draft)
  app.post("/api/templates", async (request, reply) => {
    const payload = parseOrReply(CreateTemplateInput, request.body, reply);
    if (!payload) return reply;

    try {
      const template = await store.createTemplate(payload);
      return reply.code(201).send(template);
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 2. GET /api/templates — List all templates with optional status filter
  app.get("/api/templates", async (request, reply) => {
    const query = parseOrReply(ListQuery, request.query ?? {}, reply);
    if (!query) return reply;

    try {
      const status = query.status === "draft" || query.status === "published"
        ? (query.status as TemplateStatus)
        : undefined;
      const templates = await store.listTemplates(status ? { status } : undefined);
      return templates;
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 3. GET /api/templates/:name — Get a template by name
  app.get("/api/templates/:name", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    try {
      const template = await store.getTemplate(params.name);
      if (!template) {
        return reply.code(404).send({ message: "Template not found" });
      }
      return template;
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 4. PUT /api/templates/:name — Update a template (if-match required)
  app.put("/api/templates/:name", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    const expectedVersion = requireIfMatch(request, reply);
    if (expectedVersion === undefined) return reply;

    const payload = parseOrReply(UpdateTemplateInput, request.body, reply);
    if (!payload) return reply;

    try {
      const updated = await store.updateTemplate(params.name, payload, expectedVersion);
      return updated;
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 5. POST /api/templates/:name/publish — Publish a draft template
  app.post("/api/templates/:name/publish", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    const expectedVersion = parseIfMatch(request);
    if (expectedVersion === null) {
      return reply.code(400).send({ message: "if-match header with event version is required for publish" });
    }

    try {
      const published = await store.publishTemplate(params.name, expectedVersion);
      return published;
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 6. POST /api/templates/:name/unpublish — Unpublish a template
  app.post("/api/templates/:name/unpublish", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    const expectedVersion = parseIfMatch(request);
    if (expectedVersion === null) {
      return reply.code(400).send({ message: "if-match header with event version is required for unpublish" });
    }

    try {
      const unpublished = await store.unpublishTemplate(params.name, expectedVersion);
      return unpublished;
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 7. DELETE /api/templates/:name — Delete a draft template
  app.delete("/api/templates/:name", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    const expectedVersion = parseIfMatch(request);
    if (expectedVersion === null) {
      return reply.code(400).send({ message: "if-match header with event version is required for delete" });
    }

    try {
      await store.deleteTemplate(params.name, expectedVersion);
      return reply.code(204).send();
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 8. GET /api/templates/:name/export — Export a published template as JSON
  app.get("/api/templates/:name/export", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    try {
      const pkg = await store.exportTemplate(params.name);
      // Validate the export package conforms to schema
      TemplateExportPackageSchema.parse(pkg);
      return pkg;
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 9. GET /api/templates/:name/versions — Get version history
  app.get("/api/templates/:name/versions", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    try {
      const history = await store.getTemplateVersionHistory(params.name);
      return history;
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });

  // 10. POST /api/templates/:name/instantiate — Instantiate a task from a template
  app.post("/api/templates/:name/instantiate", async (request, reply) => {
    const params = parseOrReply(TemplateNameParams, request.params, reply);
    if (!params) return reply;

    const body = parseOrReply(TemplateInstantiationSchema, request.body, reply);
    if (!body) return reply;

    try {
      const template = await store.getTemplate(params.name);
      if (!template) {
        return reply.code(404).send({ message: "Template not found" });
      }

      if (template.status === "draft") {
        return reply.code(400).send({
          message: "Cannot instantiate a draft template. Publish it first.",
        });
      }

      // Create a task spec from the template instantiation parameters
      const taskTitle = body.parameters.title
        ? String(body.parameters.title)
        : `Template: ${params.name} v${body.templateVersion}`;
      const taskPrompt = body.parameters.prompt
        ? String(body.parameters.prompt)
        : `Instantiated from template ${params.name} v${body.templateVersion}`;

      const taskSpec = {
        id: crypto.randomUUID(),
        title: taskTitle,
        prompt: taskPrompt,
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium" as const,
      };

      const projection = await defaultOrchestratorService.createTask(taskSpec);
      return reply.code(201).send(projection);
    } catch (error) {
      return handleStoreError(error, reply);
    }
  });
}
