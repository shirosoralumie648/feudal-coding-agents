import { z } from "zod";

const DateSchema = z.coerce.date();

export const MessageRouteType = {
  Direct: "direct",
  Broadcast: "broadcast",
  Capability: "capability"
} as const;

export type MessageRouteType = (typeof MessageRouteType)[keyof typeof MessageRouteType];

const TargetSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1)
]);

const ParamsSchema = z.record(z.string(), z.unknown());

export const AgentMessageSchema = z.object({
  id: z.string().uuid(),
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: ParamsSchema,
  from: z.string().min(1),
  to: TargetSchema,
  timestamp: DateSchema
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: ParamsSchema,
  from: z.string().min(1),
  to: TargetSchema,
  timestamp: DateSchema
});

export type AgentNotification = z.infer<typeof AgentNotificationSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string().min(1),
  data: z.unknown().optional()
});

export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export const AgentMessageResponseSchema = z.object({
  id: z.string().uuid(),
  jsonrpc: z.literal("2.0"),
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  timestamp: DateSchema
});

export type AgentMessageResponse = z.infer<typeof AgentMessageResponseSchema>;

export const AgentEndpointSchema = z.object({
  agentId: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  status: z.enum(["online", "offline", "busy"]),
  lastSeen: DateSchema
});

export type AgentEndpoint = z.infer<typeof AgentEndpointSchema>;

export const MessageRouteSchema = z.object({
  type: z.nativeEnum(MessageRouteType),
  target: z.union([z.string().min(1), z.array(z.string().min(1)).min(1), z.instanceof(RegExp)]),
  priority: z.number().int().min(0).optional()
});

export type MessageRoute = z.infer<typeof MessageRouteSchema>;

export type AgentJsonRpcEnvelope =
  | AgentMessage
  | AgentNotification
  | AgentMessageResponse;

export interface DeliveryResult {
  agentId: string;
  delivered: boolean;
  error?: string;
}

export interface SendResult {
  messageId: string;
  delivered: boolean;
  deliveries: DeliveryResult[];
}

export interface BroadcastResult {
  messageId: string;
  deliveredTo: string[];
  failed: DeliveryResult[];
}
