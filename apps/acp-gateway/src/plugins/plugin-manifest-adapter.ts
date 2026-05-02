import type {
  AcpWorkerExtension,
  PluginManifest,
  PluginRecord
} from "@feudal/contracts";
import type { AgentRegistrationInput } from "../agent-registry/types";

export type PluginAgentMetadata = NonNullable<
  AgentRegistrationInput["metadata"]
> & {
  pluginId: string;
  pluginVersion: string;
  extensionPoint: "acp-worker";
  displayName: string;
  artifactName: string;
  required: boolean;
  enabledByDefault: boolean;
};

export function isAcpWorkerExtension(
  extension: PluginManifest["extensionPoints"][number]
): extension is AcpWorkerExtension {
  return extension.type === "acp-worker";
}

export function createPluginAgentMetadata(
  manifest: PluginManifest,
  extension: AcpWorkerExtension
): PluginAgentMetadata {
  return {
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    extensionPoint: extension.type,
    displayName: extension.displayName,
    artifactName: extension.artifactName,
    required: extension.required,
    enabledByDefault: extension.enabledByDefault
  };
}

export function pluginAcpWorkerToAgentRegistration(
  manifest: PluginManifest,
  extension: AcpWorkerExtension
): AgentRegistrationInput {
  return {
    agentId: extension.workerName,
    capabilities: extension.capabilities,
    status: "online",
    metadata: createPluginAgentMetadata(manifest, extension),
    isTemporary: false
  };
}

export function pluginManifestToAgentRegistrations(
  manifest: PluginManifest
): AgentRegistrationInput[] {
  return manifest.extensionPoints
    .filter(isAcpWorkerExtension)
    .map((extension) =>
      pluginAcpWorkerToAgentRegistration(manifest, extension)
    );
}

export function pluginRecordToAgentRegistrations(
  record: PluginRecord
): AgentRegistrationInput[] {
  if (record.state !== "enabled") {
    return [];
  }

  return pluginManifestToAgentRegistrations(record.manifest);
}

export function pluginRecordsToAgentRegistrations(
  records: PluginRecord[]
): AgentRegistrationInput[] {
  return records.flatMap((record) => pluginRecordToAgentRegistrations(record));
}
