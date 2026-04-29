import { describe, expect, it } from "vitest";
import { MemoryTemplateStore } from "./workflow-template-store";
import type { WorkflowTemplate } from "./workflow-template-types";

function makeDraftInput(overrides: Partial<Omit<WorkflowTemplate, "status" | "eventVersion" | "createdAt" | "updatedAt">> = {}) {
  return {
    name: overrides.name ?? "test-template",
    version: overrides.version ?? "1.0.0",
    parameters: overrides.parameters ?? [
      { name: "param1", type: "string" as const, required: true, description: "A test param" }
    ],
    steps: overrides.steps ?? [
      {
        id: "step-1",
        type: "intake" as const,
        agent: "intake-agent",
        dependsOn: [],
        config: {}
      }
    ]
  };
}

describe("MemoryTemplateStore", () => {
  // ---- Test 1: createTemplate stores a new template with status "draft" ----
  it("creates a template with status draft and eventVersion 1", async () => {
    const store = new MemoryTemplateStore();
    const input = makeDraftInput({ name: "my-workflow" });

    const created = await store.createTemplate(input);

    expect(created.status).toBe("draft");
    expect(created.eventVersion).toBe(1);
    expect(created.name).toBe("my-workflow");
    expect(created.version).toBe("1.0.0");
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();
  });

  // ---- Test 2: createTemplate rejects duplicate names ----
  it("rejects creating a template with a name that already exists", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "duplicate-me" }));

    await expect(
      store.createTemplate(makeDraftInput({ name: "duplicate-me" }))
    ).rejects.toThrow(/already exists/);
  });

  // ---- Test 3: updateTemplate with matching expectedVersion ----
  it("updates template fields when expectedVersion matches", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "update-me", version: "1.0.0" }));

    const updated = await store.updateTemplate(
      "update-me",
      { version: "2.0.0", parameters: [] },
      1
    );

    expect(updated.version).toBe("2.0.0");
    expect(updated.parameters).toEqual([]);
    expect(updated.eventVersion).toBe(2);
    expect(updated.updatedAt).not.toBe(updated.createdAt);
  });

  // ---- Test 4: updateTemplate throws version mismatch error ----
  it("throws version mismatch when expectedVersion does not match", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "versioned" }));

    // Template was created at version 1, passing version 3 should fail
    await expect(
      store.updateTemplate("versioned", { version: "3.0.0" }, 3)
    ).rejects.toThrow(/Version mismatch/);
  });

  // ---- Test 5: publishTemplate transitions draft to published ----
  it("publishes a draft template transitioning status to published", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "publish-me" }));

    const published = await store.publishTemplate("publish-me", 1);

    expect(published.status).toBe("published");
    expect(published.lastPublishedVersion).toBe(2);
    expect(published.eventVersion).toBe(2);
  });

  // ---- Test 6: publishTemplate rejects already published templates ----
  it("rejects publishing a template that is already published", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "already-pub" }));
    await store.publishTemplate("already-pub", 1);

    await expect(
      store.publishTemplate("already-pub", 2)
    ).rejects.toThrow(/already published/);
  });

  // ---- Test 7: unpublishTemplate transitions published back to draft ----
  it("unpublishes a published template back to draft", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "unpub-me" }));
    await store.publishTemplate("unpub-me", 1);

    const unpublished = await store.unpublishTemplate("unpub-me", 2);

    expect(unpublished.status).toBe("draft");
    expect(unpublished.eventVersion).toBe(3);
  });

  // ---- Test 8: listTemplates with status filter ----
  it("lists templates with optional status filter", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "draft-1" }));
    const pub = await store.createTemplate(makeDraftInput({ name: "pub-1" }));
    await store.publishTemplate("pub-1", 1);
    await store.createTemplate(makeDraftInput({ name: "draft-2" }));

    const all = await store.listTemplates();
    expect(all).toHaveLength(3);

    const published = await store.listTemplates({ status: "published" });
    expect(published).toHaveLength(1);
    expect(published[0].name).toBe("pub-1");

    const drafts = await store.listTemplates({ status: "draft" });
    expect(drafts).toHaveLength(2);
  });

  // ---- Test 9: deleteTemplate protects published templates ----
  it("deletes a draft template and rejects deletion of published templates", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "delete-me" }));

    // Can delete a draft
    await store.deleteTemplate("delete-me", 1);
    const deleted = await store.getTemplate("delete-me");
    expect(deleted).toBeUndefined();

    // Cannot delete a published template
    await store.createTemplate(makeDraftInput({ name: "pub-to-delete" }));
    await store.publishTemplate("pub-to-delete", 1);

    await expect(
      store.deleteTemplate("pub-to-delete", 2)
    ).rejects.toThrow(/Cannot delete published template/);
  });

  // ---- Test 10: getTemplateVersionHistory returns events chronologically ----
  it("returns version history events in chronological order", async () => {
    const store = new MemoryTemplateStore();
    await store.createTemplate(makeDraftInput({ name: "history-me" }));
    await store.updateTemplate("history-me", { version: "2.0.0" }, 1);
    await store.publishTemplate("history-me", 2);
    await store.unpublishTemplate("history-me", 3);

    const history = await store.getTemplateVersionHistory("history-me");

    expect(history).toHaveLength(4);
    expect(history[0].eventType).toBe("template.created");
    expect(history[1].eventType).toBe("template.updated");
    expect(history[2].eventType).toBe("template.published");
    expect(history[3].eventType).toBe("template.unpublished");

    // Versions should be sequential
    expect(history[0].eventVersion).toBe(1);
    expect(history[1].eventVersion).toBe(2);
    expect(history[2].eventVersion).toBe(3);
    expect(history[3].eventVersion).toBe(4);
  });
});
