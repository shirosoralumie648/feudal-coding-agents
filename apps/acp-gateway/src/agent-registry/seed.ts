/**
 * Seeds the agent registry from the static worker manifests.
 *
 * Converts the ACPAgentManifest entries in manifests.ts into
 * agent registration inputs suitable for the dynamic registry.
 */

import type { AgentRegistrationInput } from "./types";
import type { ACPAgentManifest } from "@feudal/acp";

/**
 * Convert an ACP agent manifest to a registry registration input.
 */
export function acpManifestToRegistryManifest(acp: ACPAgentManifest): AgentRegistrationInput {
  return {
    agentId: acp.name,
    capabilities: acp.capabilities,
    status: "online",
    metadata: {
      displayName: acp.displayName,
      role: acp.role,
      narrativeAlias: acp.narrativeAlias,
      capabilityGroup: acp.capabilityGroup,
      description: acp.description,
      required: acp.required ?? false,
      enabledByDefault: acp.enabledByDefault ?? false
    },
    isTemporary: false
  };
}
