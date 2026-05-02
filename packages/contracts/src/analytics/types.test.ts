import { describe, expect, it } from "vitest";
import {
  AnalyticEventSchema,
  AuditTrailQuerySchema,
  MetricSnapshotSchema,
  type MetricEventEmitter,
  type MetricListener,
  type MetricSnapshot
} from "./types";

const snapshot = {
  timestamp: "2026-05-02T00:00:00.000Z",
  tasksByStatus: {
    completed: 3,
    awaiting_approval: 1
  },
  runsByAgent: {
    "gongbu-executor": 2
  },
  runsByStatus: {
    completed: 2,
    failed: 1
  },
  totalTaskCount: 4,
  totalRunCount: 3,
  awaitingApproval: 1,
  recoveryRequired: 0,
  avgApprovalLatencyMs: 1200,
  errorRate: 0.25,
  tokenUsage: {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    byAgent: []
  }
} satisfies MetricSnapshot;

describe("analytics contracts", () => {
  it("parses a valid metric snapshot with all dimensions", () => {
    expect(MetricSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("rejects metric snapshots missing required dimensions", () => {
    const { error } = MetricSnapshotSchema.safeParse({
      ...snapshot,
      tokenUsage: undefined
    });

    expect(error).toBeDefined();
  });

  it("allows a metric listener implementation", () => {
    const seen: MetricSnapshot[] = [];
    const listener: MetricListener = {
      onMetricSnapshot(nextSnapshot) {
        seen.push(nextSnapshot);
      }
    };

    listener.onMetricSnapshot(snapshot);

    expect(seen).toEqual([snapshot]);
  });

  it("allows a metric event emitter implementation", () => {
    const listeners = new Set<MetricListener>();
    const emitter: MetricEventEmitter = {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getLatestSnapshot() {
        return snapshot;
      }
    };
    const listener: MetricListener = { onMetricSnapshot() {} };
    const unsubscribe = emitter.subscribe(listener);

    expect(emitter.getLatestSnapshot()).toEqual(snapshot);
    expect(listeners.has(listener)).toBe(true);

    unsubscribe();

    expect(listeners.has(listener)).toBe(false);
  });

  it("parses audit trail filters", () => {
    const query = AuditTrailQuerySchema.parse({
      taskId: "task-1",
      agentId: "agent-1",
      eventType: "task.created",
      timeRange: {
        start: "2026-05-02T00:00:00.000Z",
        end: "2026-05-02T01:00:00.000Z"
      },
      searchQuery: "approval",
      limit: 50
    });

    expect(query.limit).toBe(50);
  });

  it("validates SSE-ready analytic event envelopes", () => {
    const event = AnalyticEventSchema.parse({
      type: "snapshot",
      payload: snapshot
    });

    expect(event.type).toBe("snapshot");
  });
});

