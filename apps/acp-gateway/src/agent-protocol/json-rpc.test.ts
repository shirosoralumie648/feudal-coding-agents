import { describe, expect, it } from "vitest";
import {
  createJsonRpcError,
  createJsonRpcRequest,
  createJsonRpcResponse,
  isJsonRpcRequest,
  isJsonRpcResponse,
  parseJsonRpcMessage
} from "./json-rpc";

describe("agent-protocol/json-rpc", () => {
  it("creates valid JSON-RPC requests", () => {
    const request = createJsonRpcRequest({
      id: "550e8400-e29b-41d4-a716-446655440001",
      method: "agent.ping",
      params: { value: "hello" },
      from: "agent-a",
      to: "agent-b"
    });

    expect(request.jsonrpc).toBe("2.0");
    expect(request.method).toBe("agent.ping");
    expect(request.params).toEqual({ value: "hello" });
  });

  it("creates valid JSON-RPC responses", () => {
    const response = createJsonRpcResponse({
      id: "550e8400-e29b-41d4-a716-446655440001",
      result: { ok: true },
      from: "agent-b",
      to: "agent-a"
    });

    expect(response.result).toEqual({ ok: true });
    expect(isJsonRpcResponse(response)).toBe(true);
  });

  it("creates standard JSON-RPC error responses", () => {
    const response = createJsonRpcError({
      id: "550e8400-e29b-41d4-a716-446655440001",
      code: -32601,
      message: "Method not found",
      from: "agent-b",
      to: "agent-a",
      data: { method: "agent.unknown" }
    });

    expect(response.error.code).toBe(-32601);
    expect(response.error.data).toEqual({ method: "agent.unknown" });
  });

  it("parses request and notification messages", () => {
    const request = parseJsonRpcMessage({
      id: "550e8400-e29b-41d4-a716-446655440001",
      jsonrpc: "2.0",
      method: "agent.ping",
      params: {},
      from: "agent-a",
      to: "agent-b",
      timestamp: "2026-04-27T10:00:00.000Z"
    });
    const notification = parseJsonRpcMessage({
      jsonrpc: "2.0",
      method: "agent.status",
      params: { status: "ready" },
      from: "agent-a",
      to: "agent-b",
      timestamp: "2026-04-27T10:00:00.000Z"
    });

    expect(isJsonRpcRequest(request)).toBe(true);
    expect(isJsonRpcRequest(notification)).toBe(false);
  });

  it("rejects malformed JSON-RPC payloads", () => {
    expect(() =>
      parseJsonRpcMessage({
        jsonrpc: "1.0",
        method: "agent.ping"
      })
    ).toThrow();
  });
});
