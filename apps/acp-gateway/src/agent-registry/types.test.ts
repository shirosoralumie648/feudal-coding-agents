import { describe, expect, it } from "vitest";
import {
  AgentMetadataSchema,
  AgentRegistrationSchema,
  AgentStatusSchema,
  DiscoveryQuerySchema,
  type AgentMetadata,
  type AgentRegistration,
  type AgentStatus
} from "./types";

function makeAgentMetadata(overrides?: Partial<AgentMetadata>): AgentMetadata {
  return {
    agentId: "coder-v1",
    capabilities: ["code-generation", "refactoring"],
    status: "online",
    lastHeartbeat: new Date("2026-04-27T10:00:00.000Z"),
    metadata: { region: "cn-north-1", pool: "default" },
    registeredAt: new Date("2026-04-27T09:55:00.000Z"),
    isTemporary: false,
    ...overrides
  };
}

function makeRegistration(overrides?: Partial<AgentRegistration>): AgentRegistration {
  return {
    ...makeAgentMetadata(),
    registrationId: "550e8400-e29b-41d4-a716-446655440000",
    version: 1,
    ...overrides
  };
}

describe("agent-registry/types", () => {
  it.each(["online", "offline", "busy", "unhealthy"] satisfies AgentStatus[])(
    "accepts valid agent status: %s",
    (status) => {
      expect(AgentStatusSchema.parse(status)).toBe(status);
    }
  );

  it("rejects invalid agent status", () => {
    expect(() => AgentStatusSchema.parse("healthy")).toThrow();
  });

  it("validates agent metadata per Phase 2 contract", () => {
    const metadata = makeAgentMetadata();
    expect(AgentMetadataSchema.parse(metadata)).toEqual(metadata);
  });

  it("requires capabilities, status, lastHeartbeat, metadata, and registeredAt", () => {
    expect(() =>
      AgentMetadataSchema.parse({
        agentId: "coder-v1",
        capabilities: [],
        status: "online"
      })
    ).toThrow();
  });

  it("validates registration records with registrationId and version", () => {
    const registration = makeRegistration();
    expect(AgentRegistrationSchema.parse(registration)).toEqual(registration);
  });

  it("rejects registration records with invalid version", () => {
    expect(() =>
      AgentRegistrationSchema.parse({
        ...makeRegistration(),
        version: 0
      })
    ).toThrow();
  });

  it("supports discovery queries by capability pattern, status, and metadata", () => {
    const query = {
      capabilityPattern: "code-*",
      status: ["online", "busy"],
      metadata: { region: "cn-north-1" }
    };

    expect(DiscoveryQuerySchema.parse(query)).toEqual(query);
  });

  it("supports discovery queries with a regular expression capability matcher", () => {
    const query = {
      capabilities: /^code-/
    };

    expect(DiscoveryQuerySchema.parse(query)).toEqual(query);
  });

  it("rejects malformed discovery queries", () => {
    expect(() =>
      DiscoveryQuerySchema.parse({
        status: ["healthy"]
      })
    ).toThrow();
  });
});
