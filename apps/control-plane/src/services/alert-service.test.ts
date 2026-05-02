import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AlertRule,
  MetricEventEmitter,
  MetricListener,
  MetricSnapshot
} from "@feudal/contracts";
import { AlertService } from "./alert-service";

const baseSnapshot: MetricSnapshot = {
  timestamp: "2026-05-02T00:00:00.000Z",
  tasksByStatus: {},
  runsByAgent: {},
  runsByStatus: {},
  totalTaskCount: 0,
  totalRunCount: 0,
  awaitingApproval: 0,
  recoveryRequired: 0,
  avgApprovalLatencyMs: null,
  errorRate: 0,
  tokenUsage: {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    byAgent: []
  }
};

function backlogRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "alert-task-backlog",
    name: "Task Backlog Alert",
    description: "Backlog threshold",
    enabled: true,
    metricField: "totalTaskCount",
    operator: "gte",
    threshold: 5,
    suppressionWindowMs: 300000,
    notificationChannels: ["in-app"],
    ...overrides
  };
}

class MockAnalyticsService implements MetricEventEmitter {
  listeners = new Set<MetricListener>();
  latest: MetricSnapshot | undefined;

  subscribe(listener: MetricListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLatestSnapshot() {
    return this.latest;
  }

  emit(snapshot: MetricSnapshot) {
    this.latest = snapshot;
    for (const listener of this.listeners) {
      listener.onMetricSnapshot(snapshot);
    }
  }
}

function createService(options?: {
  rules?: AlertRule[];
  webhookUrl?: string;
  analytics?: MockAnalyticsService;
}) {
  return new AlertService({
    rules: options?.rules ?? [backlogRule()],
    webhookUrl: options?.webhookUrl,
    analyticsService: options?.analytics ?? new MockAnalyticsService()
  });
}

describe("AlertService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires an alert when a metric meets the threshold", () => {
    const service = createService();

    service.evaluate({ ...baseSnapshot, totalTaskCount: 5 });

    expect(service.getPendingAlerts()).toHaveLength(1);
    expect(service.getAlertStates()[0]?.status).toBe("firing");
  });

  it("does not fire below threshold", () => {
    const service = createService();

    service.evaluate({ ...baseSnapshot, totalTaskCount: 4 });

    expect(service.getPendingAlerts()).toHaveLength(0);
    expect(service.getAlertStates()[0]?.status).toBe("ok");
  });

  it("suppresses duplicate alerts within the suppression window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T00:00:00.000Z"));
    const service = createService();

    service.evaluate({ ...baseSnapshot, totalTaskCount: 5 });
    service.getPendingAlerts();
    vi.setSystemTime(new Date("2026-05-02T00:01:00.000Z"));
    service.evaluate({ ...baseSnapshot, totalTaskCount: 6 });

    expect(service.getPendingAlerts()).toHaveLength(0);
    expect(service.getAlertStates()[0]?.status).toBe("suppressed");
  });

  it("fires again after the suppression window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T00:00:00.000Z"));
    const service = createService();

    service.evaluate({ ...baseSnapshot, totalTaskCount: 5 });
    service.getPendingAlerts();
    vi.setSystemTime(new Date("2026-05-02T00:06:00.000Z"));
    service.evaluate({ ...baseSnapshot, totalTaskCount: 6 });

    expect(service.getPendingAlerts()).toHaveLength(1);
    expect(service.getAlertStates()[0]?.status).toBe("firing");
  });

  it("auto-resolves after a firing alert recovers", () => {
    const service = createService();

    service.evaluate({ ...baseSnapshot, totalTaskCount: 5 });
    service.getPendingAlerts();
    service.evaluate({ ...baseSnapshot, totalTaskCount: 2 });

    const alerts = service.getPendingAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.status).toBe("resolved");
    expect(service.getAlertStates()[0]?.status).toBe("ok");
  });

  it("returns and clears pending in-app alerts", () => {
    const service = createService();

    service.evaluate({ ...baseSnapshot, totalTaskCount: 5 });

    expect(service.getPendingAlerts()).toHaveLength(1);
    expect(service.getPendingAlerts()).toHaveLength(0);
  });

  it("dispatches webhook notifications when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const service = createService({
      webhookUrl: "https://hooks.example.test/alert",
      rules: [backlogRule({ notificationChannels: ["webhook"] })]
    });

    service.evaluate({ ...baseSnapshot, totalTaskCount: 5 });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example.test/alert",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" }
      })
    );
  });

  it("does not evaluate disabled rules", () => {
    const service = createService({
      rules: [backlogRule({ enabled: false })]
    });

    service.evaluate({ ...baseSnapshot, totalTaskCount: 50 });

    expect(service.getPendingAlerts()).toHaveLength(0);
  });

  it("subscribes and unsubscribes from analytics snapshots", () => {
    const analytics = new MockAnalyticsService();
    const service = createService({ analytics });

    service.start();
    analytics.emit({ ...baseSnapshot, totalTaskCount: 5 });
    service.stop();
    analytics.emit({ ...baseSnapshot, totalTaskCount: 6 });

    expect(service.getPendingAlerts()).toHaveLength(1);
  });
});

