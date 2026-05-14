import { randomUUID } from "node:crypto";
import {
  AgentMessageResponseSchema,
  AgentMessageSchema,
  AgentNotificationSchema,
  JsonRpcErrorSchema,
  type AgentJsonRpcEnvelope,
  type AgentMessage,
  type AgentMessageResponse,
  type AgentNotification,
  type JsonRpcError
} from "./types";

export function createJsonRpcRequest(input: {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
  from: string;
  to: string | string[];
}): AgentMessage {
  return AgentMessageSchema.parse({
    id: input.id ?? randomUUID(),
    jsonrpc: "2.0",
    method: input.method,
    params: input.params ?? {},
    from: input.from,
    to: input.to,
    timestamp: new Date()
  });
}

export function createJsonRpcNotification(input: {
  method: string;
  params?: Record<string, unknown>;
  from: string;
  to: string | string[];
}): AgentNotification {
  return AgentNotificationSchema.parse({
    jsonrpc: "2.0",
    method: input.method,
    params: input.params ?? {},
    from: input.from,
    to: input.to,
    timestamp: new Date()
  });
}

export function createJsonRpcResponse(input: {
  id: string;
  result?: unknown;
  error?: JsonRpcError;
  from: string;
  to: string;
}): AgentMessageResponse {
  return AgentMessageResponseSchema.parse({
    id: input.id,
    jsonrpc: "2.0",
    result: input.result,
    error: input.error,
    from: input.from,
    to: input.to,
    timestamp: new Date()
  });
}

export function createJsonRpcError(input: {
  id: string;
  code: number;
  message: string;
  data?: unknown;
  from: string;
  to: string;
}): AgentMessageResponse {
  const error = JsonRpcErrorSchema.parse({
    code: input.code,
    message: input.message,
    data: input.data
  });

  return createJsonRpcResponse({
    id: input.id,
    error,
    from: input.from,
    to: input.to
  });
}

export function parseJsonRpcMessage(raw: unknown): AgentJsonRpcEnvelope {
  const request = AgentMessageSchema.safeParse(raw);
  if (request.success) {
    return request.data;
  }

  const notification = AgentNotificationSchema.safeParse(raw);
  if (notification.success) {
    return notification.data;
  }

  return AgentMessageResponseSchema.parse(raw);
}

export function isJsonRpcRequest(message: AgentJsonRpcEnvelope): message is AgentMessage {
  return "id" in message && "method" in message;
}

export function isJsonRpcResponse(
  message: AgentJsonRpcEnvelope
): message is AgentMessageResponse {
  return "id" in message && ("result" in message || "error" in message) && !("method" in message);
}
