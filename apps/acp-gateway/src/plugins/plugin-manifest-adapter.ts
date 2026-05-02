import type {
  AcpWorkerExtension,
  PluginManifest,
  PluginRecord
} from "@feudal/contracts";
import type { AgentRegistrationInput } from "../agent-registry/types";

function isAcpWorkerExtension(
  extension: PluginManifest["extensionPoints"][number]
): extension is AcpWorkerExtension {
  return extension.type === "acp-worker";
}

export function pluginManifestToAgentRegistrations(
  manifest: PluginManifest
): AgentRegistrationInput[] {
  return manifest.extensionPoints
    .filter(isAcpWorkerExtension)
    .map((extension) => ({
      agentId: extension.workerName,
      capabilities: extension.capabilities,
      status: "online" as const,
      metadata: {
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        extensionPoint: extension.type,
        displayName: extension.displayName,
        artifactName: extension.artifactName,
        required: extension.required,
        enabledByDefault: extension.enabledByDefault
      },
      isTemporary: false
    }));
}

export function pluginRecordsToAgentRegistrations(
  records: PluginRecord[]
): AgentRegistrationInput[] {
  return records
    .filter((record) => record.state === "enabled")
    .flatMap((record) => pluginManifestToAgentRegistrations(record.manifest));
}

