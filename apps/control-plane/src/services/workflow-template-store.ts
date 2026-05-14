import type { WorkflowTemplate, TemplateExportPackage, TemplateStatus } from "./workflow-template-types";

export interface TemplateVersionEvent {
  readonly eventType: "template.created" | "template.updated" | "template.published" | "template.unpublished" | "template.deleted";
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly templateName: string;
  readonly status: TemplateStatus | null;
}

export interface ListTemplatesFilter {
  status?: TemplateStatus;
}

export interface TemplateStore {
  createTemplate(template: Omit<WorkflowTemplate, "status" | "eventVersion" | "createdAt" | "updatedAt">): Promise<WorkflowTemplate>;
  getTemplate(name: string): Promise<WorkflowTemplate | undefined>;
  updateTemplate(name: string, updates: Partial<Omit<WorkflowTemplate, "name" | "createdAt" | "eventVersion">>, expectedVersion: number): Promise<WorkflowTemplate>;
  publishTemplate(name: string, expectedVersion: number): Promise<WorkflowTemplate>;
  unpublishTemplate(name: string, expectedVersion: number): Promise<WorkflowTemplate>;
  deleteTemplate(name: string, expectedVersion: number): Promise<void>;
  listTemplates(filter?: ListTemplatesFilter): Promise<WorkflowTemplate[]>;
  getTemplateVersionHistory(name: string): Promise<TemplateVersionEvent[]>;
  exportTemplate(name: string): Promise<TemplateExportPackage>;
  importTemplate(pkg: TemplateExportPackage): Promise<WorkflowTemplate>;
}

export class MemoryTemplateStore implements TemplateStore {
  private readonly templates = new Map<string, WorkflowTemplate>();
  private readonly versionHistory = new Map<string, TemplateVersionEvent[]>();
  private readonly publishedCache = new Map<string, WorkflowTemplate>();
  private lastTimestamp = new Date(0);

  private now(): string {
    const current = new Date();
    if (current <= this.lastTimestamp) {
      return new Date(this.lastTimestamp.getTime() + 1).toISOString();
    }
    this.lastTimestamp = current;
    return current.toISOString();
  }

  private recordEvent(
    eventType: TemplateVersionEvent["eventType"],
    eventVersion: number,
    templateName: string,
    status: TemplateStatus | null
  ): void {
    const event: TemplateVersionEvent = {
      eventType,
      eventVersion,
      occurredAt: this.now(),
      templateName,
      status
    };
    const existing = this.versionHistory.get(templateName) ?? [];
    this.versionHistory.set(templateName, [...existing, event]);
  }

  private validateTemplateExists(
    existing: WorkflowTemplate | undefined,
    name: string
  ): WorkflowTemplate {
    if (!existing) {
      throw new Error(`Template "${name}" not found`);
    }
    return existing;
  }

  private checkVersion(
    existing: WorkflowTemplate,
    expectedVersion: number,
    name: string
  ): void {
    if (existing.eventVersion !== expectedVersion) {
      throw new Error(
        `Version mismatch for template "${name}": expected v${expectedVersion}, current v${existing.eventVersion}`
      );
    }
  }

  async createTemplate(
    input: Omit<WorkflowTemplate, "status" | "eventVersion" | "createdAt" | "updatedAt">
  ): Promise<WorkflowTemplate> {
    if (this.templates.has(input.name)) {
      throw new Error(`Template "${input.name}" already exists`);
    }

    const now = this.now();
    const template: WorkflowTemplate = {
      ...input,
      status: "draft",
      eventVersion: 1,
      createdAt: now,
      updatedAt: now
    };

    this.templates.set(input.name, template);
    this.recordEvent("template.created", 1, input.name, "draft");

    return template;
  }

  async getTemplate(name: string): Promise<WorkflowTemplate | undefined> {
    return this.templates.get(name);
  }

  async updateTemplate(
    name: string,
    updates: Partial<Omit<WorkflowTemplate, "name" | "createdAt" | "eventVersion">>,
    expectedVersion: number
  ): Promise<WorkflowTemplate> {
    const existing = this.validateTemplateExists(this.templates.get(name), name);
    this.checkVersion(existing, expectedVersion, name);

    const newVersion = existing.eventVersion + 1;
    const updated: WorkflowTemplate = {
      name: existing.name,
      version: updates.version ?? existing.version,
      parameters: updates.parameters ?? existing.parameters,
      steps: updates.steps ?? existing.steps,
      status: updates.status ?? existing.status,
      createdAt: existing.createdAt,
      updatedAt: this.now(),
      lastPublishedVersion: updates.lastPublishedVersion ?? existing.lastPublishedVersion,
      eventVersion: newVersion
    };

    this.templates.set(name, updated);

    if (updated.status === "published") {
      this.publishedCache.set(name, updated);
    }

    this.recordEvent("template.updated", newVersion, name, updated.status);

    return updated;
  }

  async publishTemplate(
    name: string,
    expectedVersion: number
  ): Promise<WorkflowTemplate> {
    const existing = this.validateTemplateExists(this.templates.get(name), name);
    this.checkVersion(existing, expectedVersion, name);

    if (existing.status === "published") {
      throw new Error(`Template "${name}" is already published`);
    }

    const newVersion = existing.eventVersion + 1;
    const published: WorkflowTemplate = {
      ...existing,
      status: "published",
      lastPublishedVersion: newVersion,
      updatedAt: this.now(),
      eventVersion: newVersion
    };

    this.templates.set(name, published);
    this.publishedCache.set(name, published);
    this.recordEvent("template.published", newVersion, name, "published");

    return published;
  }

  async unpublishTemplate(
    name: string,
    expectedVersion: number
  ): Promise<WorkflowTemplate> {
    const existing = this.validateTemplateExists(this.templates.get(name), name);
    this.checkVersion(existing, expectedVersion, name);

    if (existing.status !== "published") {
      throw new Error(`Template "${name}" is not published`);
    }

    const newVersion = existing.eventVersion + 1;
    const unpublished: WorkflowTemplate = {
      ...existing,
      status: "draft",
      updatedAt: this.now(),
      eventVersion: newVersion
    };

    this.templates.set(name, unpublished);
    this.publishedCache.delete(name);
    this.recordEvent("template.unpublished", newVersion, name, "draft");

    return unpublished;
  }

  async deleteTemplate(
    name: string,
    expectedVersion: number
  ): Promise<void> {
    const existing = this.validateTemplateExists(this.templates.get(name), name);
    this.checkVersion(existing, expectedVersion, name);

    if (existing.status === "published") {
      throw new Error(
        `Cannot delete published template "${name}". Unpublish it first.`
      );
    }

    this.templates.delete(name);
    this.publishedCache.delete(name);
    this.recordEvent("template.deleted", existing.eventVersion + 1, name, null);
  }

  async listTemplates(filter?: ListTemplatesFilter): Promise<WorkflowTemplate[]> {
    const all = [...this.templates.values()];

    if (!filter?.status) {
      return all;
    }

    return all.filter((t) => t.status === filter.status);
  }

  async getTemplateVersionHistory(name: string): Promise<TemplateVersionEvent[]> {
    return this.versionHistory.get(name) ?? [];
  }

  // ---- export/import (D-15) ----

  async exportTemplate(name: string): Promise<TemplateExportPackage> {
    const template = this.validateTemplateExists(this.templates.get(name), name);

    if (template.status !== "published") {
      throw new Error(
        `Cannot export draft template "${name}". Publish it first.`
      );
    }

    const { status: _status, eventVersion: _ev, lastPublishedVersion: _lpv, ...rest } = template;
    void _status; void _ev; void _lpv;

    return {
      format: "feudal-template/v1",
      template: rest,
      exportedAt: this.now()
    };
  }

  async importTemplate(pkg: TemplateExportPackage): Promise<WorkflowTemplate> {
    if (pkg.format !== "feudal-template/v1") {
      throw new Error(
        `Unsupported template format: "${(pkg as { format: string }).format}". Expected "feudal-template/v1".`
      );
    }

    if (this.templates.has(pkg.template.name)) {
      throw new Error(`Template "${pkg.template.name}" already exists`);
    }

    const now = this.now();
    const template: WorkflowTemplate = {
      name: pkg.template.name,
      version: pkg.template.version,
      parameters: pkg.template.parameters,
      steps: pkg.template.steps,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      eventVersion: 1
    };

    this.templates.set(pkg.template.name, template);
    this.recordEvent("template.created", 1, pkg.template.name, "draft");

    return template;
  }
}
