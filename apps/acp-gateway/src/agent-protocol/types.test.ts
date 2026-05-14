import { describe, expect, it } from "vitest";
import {
  AgentEndpointSchema,
  AgentMessageResponseSchema,
  AgentMessageSchema,
  AgentNotificationSchema,
  JsonRpcErrorSchema,
  MessageRouteSchema,
  MessageRouteType,
  type AgentEndpoint,
  type AgentMessage,
  type AgentNotification
} from "./types";

describe("agent-protocol/types", () => {
  it("validates JSON-RPC request messages", () => {
    const message: AgentMessage = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      jsonrpc: "2.0",
      method: "agent.ping",
      params: { value: "hello" },
      from: "agent-a",
      to: "agent-b",
      timestamp: new Date("2026-04-27T10:00:00.000Z")
    };

    expect(AgentMessageSchema.parse(message)).toEqual(message);
  });

  it("validates one-way notifications without ids", () => {
    const notification: AgentNotification = {
      jsonrpc: "2.0",
      method: "agent.status",
      params: { status: "ready" },
      from: "agent-a",
      to: ["agent-b", "agent-c"],
      timestamp: new Date("2026-04-27T10:00:00.000Z")
    };

    expect(AgentNotificationSchema.parse(notification)).toEqual(notification);
  });

  it("validates JSON-RPC responses with results", () => {
    const response = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      jsonrpc: "2.0",
      result: { ok: true },
      from: "agent-b",
      to: "agent-a",
      timestamp: new Date("2026-04-27T10:00:01.000Z")
    };

    expect(AgentMessageResponseSchema.parse(response)).toEqual(response);
  });

  it("validates structured JSON-RPC errors", () => {
    const error = {
      code: -32601,
      message: "Method not found",
      data: { method: "agent.unknown" }
    };

    expect(JsonRpcErrorSchema.parse(error)).toEqual(error);
  });

  it("validates agent endpoints", () => {
    const endpoint: AgentEndpoint = {
      agentId: "agent-b",
      capabilities: ["code-generation"],
      status: "online",
      lastSeen: new Date("2026-04-27T10:00:00.000Z")
    };

    expect(AgentEndpointSchema.parse(endpoint)).toEqual(endpoint);
  });

  it("supports direct, broadcast, and capability message routes", () => {
    expect(
      MessageRouteSchema.parse({
        type: MessageRouteType.Direct,
        target: "agent-b"
      })
    ).toEqual({
      type: MessageRouteType.Direct,
      target: "agent-b"
    });

    expect(
      MessageRouteSchema.parse({
        type: MessageRouteType.Broadcast,
        target: ["agent-b", "agent-c"]
      })
    ).toEqual({
      type: MessageRouteType.Broadcast,
      target: ["agent-b", "agent-c"]
    });

    const route = MessageRouteSchema.parse({
      type: MessageRouteType.Capability,
      target: /^code-/,
      priority: 1
    });

    expect(route.type).toBe(MessageRouteType.Capability);
  });
});
