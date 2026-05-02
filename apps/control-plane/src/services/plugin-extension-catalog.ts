import type {
  AcpWorkerExtension,
  WorkflowStepProviderExtension
} from "@feudal/contracts";
import type { PluginStore } from "./plugin-store";

export class PluginExtensionCatalog {
  constructor(private readonly store: PluginStore) {}

  async listAcpWorkers(): Promise<AcpWorkerExtension[]> {
    return (await this.store.listEnabledExtensions()).acpWorkers;
  }

  async listWorkflowStepProviders(): Promise<WorkflowStepProviderExtension[]> {
    return (await this.store.listEnabledExtensions()).workflowStepProviders;
  }
}

