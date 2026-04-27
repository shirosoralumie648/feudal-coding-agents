import { describe, it, expect } from "vitest";
import {
  AgentMessageSchema,
  AgentEndpointSchema,
  MessageRouteSchema,
  type AgentMessage,
  type AgentEndpoint,
  type MessageRoute,
  MessageRouteType
} from "./types";

describe("agent-protocol/types", () => {
  describe("AgentMessage", () => {
    it("validates required fields: id, jsonrpc, method, from, to", () => {
      const validMessage: AgentMessage = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        jsonrpc: "2.0",
        method: "ping",
        params: {},
        from: "agent-a",
        to: "agent-b",
        timestamp: new Date()
      };
      expect(AgentMessageSchema.parse(validMessage)).toEqual(validMessage);
    });

    it("accepts array of targets for broadcast", () => {
      const message: AgentMessage = {
        id: "550e8400-e29b-41d4-a716-446655440002",
        jsonrpc: "2.0",
        method: "notify",
        params: { update: "status" },
        from: "agent-a",
        to: ["agent-b", "agent-c"],
        timestamp: new Date()
      };
      expect(AgentMessageSchema.parse(message)).toEqual(message);
    });

    it("rejects message missing required fields", () => {
      expect(() => AgentMessageSchema.parse({ method: "ping" })).toThrow();
    });

    it("rejects message with invalid jsonrpc version", () => {
      const badMessage = {
        id: "550e8400-e29b-41d4-a716-446655440003",
        jsonrpc: "1.0",
        method: "ping",
        params: {},
        from: "agent-a",
        to: "agent-b",
        timestamp: new Date()
      };
      expect(() => AgentMessageSchema.parse(badMessage)).toThrow();
    });
  });

  describe("AgentEndpoint", () => {
    it("validates agentId and capabilities", () => {
      const endpoint: AgentEndpoint = {
        agentId: "analyst-1",
        capabilities: ["analysis", "code-review"],
        status: "online",
        lastSeen: new Date()
      };
      expect(AgentEndpointSchema.parse(endpoint)).toEqual(endpoint);
    });

    it("accepts all valid statuses", () => {
      for (const status of ["online", "offline", "busy"] as const) {
        const endpoint: AgentEndpoint = {
          agentId: "agent-x",
          capabilities: [],
          status,
          lastSeen: new Date()
        };
        expect(AgentEndpointSchema.parse(endpoint)).toEqual(endpoint);
      }
    });

    it("rejects invalid status", () => {
      const badEndpoint = {
        agentId: "agent-x",
        capabilities: [],
        status: "unknown",
        lastSeen: new Date()
      };
      expect(() => AgentEndpointSchema.parse(badEndpoint)).toThrow();
    });
  });

  describe("MessageRoute", () => {
    it("supports direct routing", () => {
      const route: MessageRoute = {
        type: MessageRouteType.Direct,
        target: "agent-b"
      };
      expect(MessageRouteSchema.parse(route)).toEqual(route);
    });

    it("supports broadcast routing", () => {
      const route: MessageRoute = {
        type: MessageRouteType.Broadcast,
        target: ["agent-b", "agent-c"]
      };
      expect(MessageRouteSchema.parse(route)).toEqual(route);
    });

    it("supports capability-based routing with regex pattern", () => {
      const route: MessageRoute = {
        type: MessageRouteType.Capability,
        target: /code-.*/.source,
        priority: 1
      };
      const parsed = MessageRouteSchema.parse(route);
      expect(parsed.type).toBe(MessageRouteType.Capability);
    });

    it("supports optional priority for load balancing hint", () => {
      const route: MessageRoute = {
        type: MessageRouteType.Direct,
        target: "agent-b",
        priority: 5
      };
      expect(MessageRouteSchema.parse(route)).toEqual(route);
    });
  });
});
