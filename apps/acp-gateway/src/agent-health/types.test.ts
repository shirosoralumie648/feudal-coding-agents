import { describe, expect, it } from "vitest";
import {
  AgentHealthStatusSchema,
  FailoverConfigSchema,
  HealthEventSchema,
  HeartbeatConfigSchema
} from "./types";

describe("agent-health/types", () => {
  it("validates heartbeat config bounds", () => {
    expect(
      HeartbeatConfigSchema.parse({
        intervalMs: 30000,
        timeoutMs: 30000,
        maxMissedHeartbeats: 3
      })
    ).toEqual({
      intervalMs: 30000,
      timeoutMs: 30000,
      maxMissedHeartbeats: 3
    });
  });

  it("rejects out-of-range heartbeat intervals", () => {
    expect(() =>
      HeartbeatConfigSchema.parse({
        intervalMs: 1000,
        timeoutMs: 30000,
        maxMissedHeartbeats: 3
      })
    ).toThrow();
  });

  it.each(["healthy", "degraded", "unhealthy", "unknown"] as const)(
    "accepts health status %s",
    (status) => {
      expect(AgentHealthStatusSchema.parse(status)).toBe(status);
    }
  );

  it("validates health events for audit logging", () => {
    const event = {
      eventType: "status_changed",
      agentId: "agent-a",
      timestamp: new Date("2026-04-27T10:00:00.000Z"),
      previousStatus: "degraded",
      newStatus: "unhealthy",
      metadata: { missedHeartbeats: 3 }
    };

    expect(HealthEventSchema.parse(event)).toEqual(event);
  });

  it("validates failover configuration", () => {
    expect(
      FailoverConfigSchema.parse({
        enabled: true,
        maxRetryAttempts: 3,
        retryDelayMs: 5000,
        notifyOperator: true
      })
    ).toEqual({
      enabled: true,
      maxRetryAttempts: 3,
      retryDelayMs: 5000,
      notifyOperator: true
    });
  });
});
