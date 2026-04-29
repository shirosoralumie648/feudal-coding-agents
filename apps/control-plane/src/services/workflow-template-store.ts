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
  async createTemplate(): Promise<WorkflowTemplate> {
    throw new Error("Not implemented");
  }

  async getTemplate(): Promise<WorkflowTemplate | undefined> {
    throw new Error("Not implemented");
  }

  async updateTemplate(): Promise<WorkflowTemplate> {
    throw new Error("Not implemented");
  }

  async publishTemplate(): Promise<WorkflowTemplate> {
    throw new Error("Not implemented");
  }

  async unpublishTemplate(): Promise<WorkflowTemplate> {
    throw new Error("Not implemented");
  }

  async deleteTemplate(): Promise<void> {
    throw new Error("Not implemented");
  }

  async listTemplates(): Promise<WorkflowTemplate[]> {
    throw new Error("Not implemented");
  }

  async getTemplateVersionHistory(): Promise<TemplateVersionEvent[]> {
    throw new Error("Not implemented");
  }

  async exportTemplate(): Promise<TemplateExportPackage> {
    throw new Error("Not implemented");
  }

  async importTemplate(): Promise<WorkflowTemplate> {
    throw new Error("Not implemented");
  }
}
