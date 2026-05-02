import type {
  AcpWorkerExtension,
  EnabledPluginExtensions,
  WorkflowStepProviderExtension
} from "@feudal/contracts";
import type { PluginStore } from "./plugin-store";

export class PluginExtensionCatalog {
  constructor(private readonly store: PluginStore) {}

  async listEnabledExtensions(): Promise<EnabledPluginExtensions> {
    return this.store.listEnabledExtensions();
  }

  async listAcpWorkers(): Promise<AcpWorkerExtension[]> {
    return (await this.listEnabledExtensions()).acpWorkers;
  }

  async listWorkflowStepProviders(): Promise<WorkflowStepProviderExtension[]> {
    return (await this.listEnabledExtensions()).workflowStepProviders;
  }

  async getAcpWorker(
    workerName: string
  ): Promise<AcpWorkerExtension | undefined> {
    return (await this.listAcpWorkers()).find(
      (worker) => worker.workerName === workerName
    );
  }

  async getWorkflowStepProvider(
    providerId: string
  ): Promise<WorkflowStepProviderExtension | undefined> {
    return (await this.listWorkflowStepProviders()).find(
      (provider) => provider.providerId === providerId
    );
  }

  async hasAcpWorker(workerName: string): Promise<boolean> {
    return (await this.getAcpWorker(workerName)) !== undefined;
  }

  async hasWorkflowStepProvider(providerId: string): Promise<boolean> {
    return (await this.getWorkflowStepProvider(providerId)) !== undefined;
  }

  async listAcpWorkerNames(): Promise<string[]> {
    return (await this.listAcpWorkers()).map((worker) => worker.workerName);
  }

  async listWorkflowStepProviderIds(): Promise<string[]> {
    return (await this.listWorkflowStepProviders()).map(
      (provider) => provider.providerId
    );
  }

  async listWorkflowStepTypes(): Promise<string[]> {
    const providers = await this.listWorkflowStepProviders();
    return [...new Set(providers.flatMap((provider) => provider.stepTypes))];
  }
}
