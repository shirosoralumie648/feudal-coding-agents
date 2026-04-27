import { z } from "zod";

/**
 * Message routing type per D-04 (routing modes):
 * - direct: agent-to-agent addressing
 * - broadcast: send to all registered agents
 * - capability: match agents by capability pattern
 */
export const MessageRouteType = {
  Direct: "direct",
  Broadcast: "broadcast",
  Capability: "capability"
} as const;

export type MessageRouteType = (typeof MessageRouteType)[keyof typeof MessageRouteType];

/**
 * Agent message following JSON-RPC 2.0 specification per D-02.
 * Supports request/response and notification patterns per D-03.
 */
export const AgentMessageSchema = z.object({
  id: z.string().uuid(),
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  from: z.string().min(1),
  to: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  timestamp: z.date()
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

/**
 * Agent endpoint representing a registered agent per D-05/D-06.
 */
export const AgentEndpointSchema = z.object({
  agentId: z.string().min(1),
  capabilities: z.array(z.string()),
  status: z.enum(["online", "offline", "busy"]),
  lastSeen: z.date()
});

export type AgentEndpoint = z.infer<typeof AgentEndpointSchema>;

/**
 * Message route definition per D-04.
 * Target can be:
 * - string: single agent ID (direct)
 * - string[]: multiple agent IDs (broadcast)
 * - string (regex source): capability pattern (capability)
 */
export const MessageRouteSchema = z.object({
  type: z.nativeEnum(MessageRouteType),
  target: z.union([z.string(), z.array(z.string())]),
  priority: z.number().int().min(0).optional()
});

export type MessageRoute = z.infer<typeof MessageRouteSchema>;

/**
 * Response to an agent message (JSON-RPC 2.0 response pattern).
 */
export interface AgentMessageResponse {
  id: string;
  jsonrpc: "2.0";
  result: Record<string, unknown>;
  from: string;
  to: string;
  timestamp: Date;
}

/**
 * One-way notification (JSON-RPC 2.0 notification pattern per D-03).
 * Notifications carry no id and expect no response.
 */
export interface AgentNotification {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  from: string;
  to: string | string[];
  timestamp: Date;
}

/**
 * Result of a message send operation.
 */
export interface SendResult {
  messageId: string;
  delivered: boolean;
  targetAgentId: string;
  error?: string;
}

/**
 * Result of a broadcast operation.
 */
export interface BroadcastResult {
  messageId: string;
  deliveredTo: string[];
  failed: Array<{ agentId: string; error: string }>;
}
