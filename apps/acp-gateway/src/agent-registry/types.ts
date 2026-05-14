import { z } from "zod";

export const agentStatuses = ["online", "offline", "busy", "unhealthy"] as const;

export const AgentStatusSchema = z.enum(agentStatuses);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

const DateSchema = z.coerce.date();
const MetadataSchema = z.record(z.string(), z.unknown());

export const AgentMetadataSchema = z.object({
  agentId: z.string().min(1),
  capabilities: z.array(z.string().min(1)).min(1),
  status: AgentStatusSchema,
  lastHeartbeat: DateSchema,
  metadata: MetadataSchema,
  registeredAt: DateSchema,
  isTemporary: z.boolean()
});

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

export const AgentRegistrationSchema = AgentMetadataSchema.extend({
  registrationId: z.string().uuid(),
  version: z.number().int().min(1)
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

export const AgentRegistrationInputSchema = z.object({
  agentId: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).min(1),
  status: AgentStatusSchema.optional(),
  lastHeartbeat: DateSchema.optional(),
  metadata: MetadataSchema.optional(),
  registeredAt: DateSchema.optional(),
  isTemporary: z.boolean().optional()
});

export type AgentRegistrationInput = z.infer<typeof AgentRegistrationInputSchema>;

export const DiscoveryQuerySchema = z.object({
  capabilities: z.union([z.array(z.string().min(1)).min(1), z.instanceof(RegExp)]).optional(),
  status: z.array(AgentStatusSchema).min(1).optional(),
  metadata: MetadataSchema.optional(),
  capabilityPattern: z.union([z.string().min(1), z.instanceof(RegExp)]).optional()
});

export type DiscoveryQuery = z.infer<typeof DiscoveryQuerySchema>;

export interface DiscoveryResult {
  agents: AgentMetadata[];
  total: number;
}

export function validateAgentRegistrationInput(input: unknown) {
  return AgentRegistrationInputSchema.safeParse(input);
}

export function validateAgentMetadata(input: unknown) {
  return AgentMetadataSchema.safeParse(input);
}
