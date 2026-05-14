/**
 * Agent Registry - Public API
 *
 * Barrel export for the agent-registry module.
 */

export {
  agentStatuses,
  AgentStatusSchema,
  AgentMetadataSchema,
  AgentRegistrationSchema,
  AgentRegistrationInputSchema,
  DiscoveryQuerySchema,
  type AgentStatus,
  type AgentMetadata,
  type AgentRegistration,
  type AgentRegistrationInput,
  type DiscoveryQuery,
  type DiscoveryResult,
  validateAgentRegistrationInput,
  validateAgentMetadata
} from "./types";

export {
  AgentRegistry,
  type AgentRegistryEvent,
  type AgentRegistryEventStore,
  type RegistrationOptions,
  type RegistrationSuccess,
  type RegistrationError,
  type RegisterResult,
} from "./registry";

export {
  AgentDiscoveryService,
} from "./discovery";
