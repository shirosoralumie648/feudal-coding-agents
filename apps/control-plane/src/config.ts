import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpACPClient } from "@feudal/acp/http-client";
import { createMockACPClient } from "@feudal/acp/mock-client";
import {
  createPostgresEventStore,
  createPostgresPool,
  runMigrations
} from "@feudal/persistence";
import { createTaskReadModel } from "./persistence/task-read-model";
import { createOrchestratorService } from "./services/orchestrator-service";
import { PluginDiscovery } from "./services/plugin-discovery";
import { PluginExtensionCatalog } from "./services/plugin-extension-catalog";
import { MemoryPluginStore } from "./services/plugin-store";
import { createTaskRunGateway } from "./services/task-run-gateway";
import { MemoryTaskStore, type TaskStore } from "./store";
import { MemoryTemplateStore, type TemplateStore } from "./services/workflow-template-store";
import { createWorkflowTemplateEngine, type WorkflowTemplateEngine } from "./services/workflow-template-engine";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function createACPClientFromEnv() {
  const baseUrl = process.env.ACP_BASE_URL ?? "http://127.0.0.1:4100";
  const mode = process.env.FEUDAL_ACP_MODE ?? "http";

  if (mode === "mock") {
    return createMockACPClient();
  }

  return createHttpACPClient({ baseUrl });
}

export function createTaskRunGatewayFromEnv() {
  const mode = process.env.FEUDAL_ACP_MODE ?? "http";
  const mockClient = createMockACPClient();

  if (mode === "mock") {
    return createTaskRunGateway({
      realClient: mockClient,
      mockClient
    });
  }

  return createTaskRunGateway({
    realClient: createACPClientFromEnv(),
    mockClient
  });
}

export async function createTaskStoreFromEnv() {
  if (!process.env.DATABASE_URL) {
    return new MemoryTaskStore();
  }

  const pool = createPostgresPool();
  await runMigrations(pool);
  const eventStore = createPostgresEventStore({ pool });
  return createTaskReadModel({ eventStore });
}

export function createLazyTaskStore(
  loadStore: () => Promise<TaskStore> = createTaskStoreFromEnv
): TaskStore {
  let storePromise: Promise<TaskStore> | undefined;

  const getStore = () => {
    storePromise ??= loadStore().catch((error) => {
      storePromise = undefined;
      throw error;
    });
    return storePromise;
  };

  return {
    async listTasks() {
      return (await getStore()).listTasks();
    },

    async getTask(taskId) {
      return (await getStore()).getTask(taskId);
    },

    async saveTask(task, eventType, expectedVersion) {
      return (await getStore()).saveTask(task, eventType, expectedVersion);
    },

    async recordOperatorAction(input) {
      await (await getStore()).recordOperatorAction(input);
    },

    async listOperatorActions(taskId) {
      return (await getStore()).listOperatorActions(taskId);
    },

    async getOperatorActionSummary() {
      return (await getStore()).getOperatorActionSummary();
    },

    async listTaskEvents(taskId) {
      return (await getStore()).listTaskEvents(taskId);
    },

    async listAuditEventsAfter(cursor) {
      return (await getStore()).listAuditEventsAfter(cursor);
    },

    async listTaskDiffs(taskId) {
      return (await getStore()).listTaskDiffs(taskId);
    },

    async listTaskRuns(taskId) {
      return (await getStore()).listTaskRuns(taskId);
    },

    async listTaskArtifacts(taskId) {
      return (await getStore()).listTaskArtifacts(taskId);
    },

    async replayTaskAtEventId(taskId, eventId) {
      return (await getStore()).replayTaskAtEventId(taskId, eventId);
    },

    async getRecoverySummary() {
      return (await getStore()).getRecoverySummary();
    },

    async rebuildProjectionsIfNeeded() {
      await (await getStore()).rebuildProjectionsIfNeeded();
    }
  };
}

export const defaultOrchestratorService = createOrchestratorService({
  runGateway: createTaskRunGatewayFromEnv(),
  store: createLazyTaskStore()
});

export const defaultTemplateStore: TemplateStore = new MemoryTemplateStore();
export const defaultTemplateEngine = createWorkflowTemplateEngine();

export function getPluginRootsFromEnv(): string[] {
  return (process.env.FEUDAL_PLUGIN_DIRS ?? "plugins,plugins/examples")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (path.isAbsolute(value) ? value : path.join(repoRoot, value)));
}

export const defaultPluginStore = new MemoryPluginStore();
export const defaultPluginDiscovery = new PluginDiscovery({
  roots: getPluginRootsFromEnv()
});
export const defaultPluginExtensionCatalog = new PluginExtensionCatalog(
  defaultPluginStore
);
