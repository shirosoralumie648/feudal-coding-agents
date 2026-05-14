import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { MemoryTemplateStore } from "../services/workflow-template-store";
import type { TemplateStore } from "../services/workflow-template-store";
import { registerTemplateRoutes } from "./templates";

function createApp(store?: TemplateStore) {
  const app = Fastify();
  registerTemplateRoutes(app, { store: store ?? new MemoryTemplateStore() });
  return app;
}

const sampleTemplate = {
  name: "ci-pipeline",
  version: "1.0.0",
  parameters: [
    { name: "branch", type: "string" as const, required: true, description: "Target branch" },
  ],
  steps: [
    {
      id: "build",
      type: "execution" as const,
      agent: "builder",
      dependsOn: [] as string[],
      config: { command: "npm run build" },
    },
  ],
};

describe("template routes", () => {
  // Test 1: POST creates template, returns 201 with status "draft" and eventVersion 1
  it("POST /api/templates creates a template and returns 201 with draft status", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/templates",
      payload: sampleTemplate,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe("ci-pipeline");
    expect(body.status).toBe("draft");
    expect(body.eventVersion).toBe(1);
    expect(body.version).toBe("1.0.0");
  });

  // Test 2: POST with duplicate name returns 409
  it("POST /api/templates with duplicate name returns 409", async () => {
    const app = createApp();

    // Create first
    await app.inject({
      method: "POST",
      url: "/api/templates",
      payload: sampleTemplate,
    });

    // Attempt duplicate
    const response = await app.inject({
      method: "POST",
      url: "/api/templates",
      payload: sampleTemplate,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("already exists");
  });

  // Test 3: GET lists templates with optional status filter
  it("GET /api/templates lists templates with optional status filter", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    await store.createTemplate({
      name: "template-a",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    await store.createTemplate({
      name: "template-b",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    // List all
    const all = await app.inject({ method: "GET", url: "/api/templates" });
    expect(all.statusCode).toBe(200);
    expect(all.json()).toHaveLength(2);

    // Filter by status=draft
    const draft = await app.inject({
      method: "GET",
      url: "/api/templates?status=draft",
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toHaveLength(2);

    // Filter by status=published (none published yet)
    const published = await app.inject({
      method: "GET",
      url: "/api/templates?status=published",
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toHaveLength(0);
  });

  // Test 4: GET by name returns template; non-existent returns 404
  it("GET /api/templates/:name returns template or 404", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    await store.createTemplate({
      name: "existing",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    const found = await app.inject({
      method: "GET",
      url: "/api/templates/existing",
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().name).toBe("existing");

    const missing = await app.inject({
      method: "GET",
      url: "/api/templates/nonexistent",
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().message).toBe("Template not found");
  });

  // Test 5: PUT without if-match header returns 400
  it("PUT /api/templates/:name without if-match header returns 400", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/templates/t1",
      payload: { version: "1.1.0" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("if-match");
  });

  // Test 6: PUT with wrong if-match returns 409
  it("PUT /api/templates/:name with wrong if-match value returns 409", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/templates/t1",
      headers: { "if-match": "999" },
      payload: { version: "1.1.0" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("Version mismatch");
  });

  // Test 7: PUT with correct if-match updates and returns 200
  it("PUT /api/templates/:name with correct if-match updates and returns 200", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    const created = await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/templates/t1",
      headers: { "if-match": String(created.eventVersion) },
      payload: { version: "1.1.0" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe("1.1.0");
    expect(response.json().eventVersion).toBe(created.eventVersion + 1);
  });

  // Test 8: POST publish transitions draft->published; publish already-published returns 409
  it("POST /api/templates/:name/publish transitions draft to published; duplicate returns 409", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    const created = await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    // Publish
    const published = await app.inject({
      method: "POST",
      url: "/api/templates/t1/publish",
      headers: { "if-match": String(created.eventVersion) },
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe("published");

    // Attempt to publish again
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/templates/t1/publish",
      headers: { "if-match": String(published.json().eventVersion) },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().message).toContain("already published");
  });

  // Test 9: DELETE on draft returns 204; on published returns 400
  it("DELETE /api/templates/:name on draft returns 204, on published returns 400", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    const created = await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    // Delete draft
    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/templates/t1",
      headers: { "if-match": String(created.eventVersion) },
    });
    expect(deleted.statusCode).toBe(204);

    // Create and publish, then try delete
    const store2 = new MemoryTemplateStore();
    const app2 = createApp(store2);
    const t2 = await store2.createTemplate({
      name: "t2",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });
    await store2.publishTemplate("t2", t2.eventVersion);

    const published = await store2.getTemplate("t2");
    const cantDelete = await app2.inject({
      method: "DELETE",
      url: "/api/templates/t2",
      headers: { "if-match": String(published!.eventVersion) },
    });
    expect(cantDelete.statusCode).toBe(400);
    expect(cantDelete.json().message).toContain("Cannot delete");
  });

  // Test 10: GET export returns TemplateExportPackage with format "feudal-template/v1"
  it("GET /api/templates/:name/export returns TemplateExportPackage with correct format", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    const created = await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });
    await store.publishTemplate("t1", created.eventVersion);

    const response = await app.inject({
      method: "GET",
      url: "/api/templates/t1/export",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.format).toBe("feudal-template/v1");
    expect(body.exportedAt).toBeDefined();
    expect(body.template.name).toBe("t1");
    expect(body.template.version).toBe("1.0.0");
  });

  // Test 11: GET versions returns version history array
  it("GET /api/templates/:name/versions returns version history", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/templates/t1/versions",
    });

    expect(response.statusCode).toBe(200);
    const history = response.json();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].eventType).toBe("template.created");
    expect(history[0].templateName).toBe("t1");
  });

  // Test 12: POST instantiate returns 404 for unknown template
  it("POST /api/templates/:name/instantiate returns 404 for unknown template", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    const response = await app.inject({
      method: "POST",
      url: "/api/templates/nonexistent/instantiate",
      payload: {
        templateName: "nonexistent",
        templateVersion: "1.0.0",
        parameters: {},
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Template not found");
  });

  // Test 12b: POST instantiate returns 400 for draft template
  it("POST /api/templates/:name/instantiate returns 400 for draft template", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/templates/t1/instantiate",
      payload: {
        templateName: "t1",
        templateVersion: "1.0.0",
        parameters: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("Cannot instantiate a draft");
  });

  // Test 12c: POST instantiate with invalid body returns 400
  it("POST /api/templates/:name/instantiate with invalid body returns 400", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/templates/anything/instantiate",
      payload: { not: "valid" },
    });

    expect(response.statusCode).toBe(400);
  });

  // Additional: unpublish flow
  it("POST /api/templates/:name/unpublish transitions published to draft", async () => {
    const store = new MemoryTemplateStore();
    const app = createApp(store);

    const created = await store.createTemplate({
      name: "t1",
      version: "1.0.0",
      parameters: [],
      steps: [{ id: "s1", type: "execution", agent: "a", dependsOn: [] }],
    });
    const pub = await store.publishTemplate("t1", created.eventVersion);

    const response = await app.inject({
      method: "POST",
      url: "/api/templates/t1/unpublish",
      headers: { "if-match": String(pub.eventVersion) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("draft");
  });

  // Additional: unpublish without if-match returns 400
  it("POST /api/templates/:name/unpublish without if-match returns 400", async () => {
    const app = createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/templates/anything/unpublish",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("if-match");
  });
});
