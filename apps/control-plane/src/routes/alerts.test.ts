import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { AlertRule, MetricEventEmitter, MetricListener } from "@feudal/contracts";
import { registerAlertRoutes } from "./alerts";
import { AlertService } from "../services/alert-service";

const rule: AlertRule = {
  id: "alert-task-backlog",
  name: "Task Backlog Alert",
  enabled: true,
  metricField: "totalTaskCount",
  operator: "gte",
  threshold: 5,
  suppressionWindowMs: 300000,
  notificationChannels: ["in-app"]
};

const analytics: MetricEventEmitter = {
  subscribe(_listener: MetricListener) {
    return () => {};
  },
  getLatestSnapshot() {
    return undefined;
  }
};

async function createApp() {
  const app = Fastify();
  const alertService = new AlertService({
    rules: [rule],
    analyticsService: analytics
  });

  registerAlertRoutes(app, { alertService, rules: [rule] });
  await app.ready();
  return { app, alertService };
}

describe("alert routes", () => {
  it("returns alert states", async () => {
    const { app } = await createApp();

    const response = await app.inject({ method: "GET", url: "/alerts/state" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().states[0].ruleId).toBe(rule.id);
  });

  it("returns and clears pending alerts", async () => {
    const { app, alertService } = await createApp();
    alertService.evaluate({
      timestamp: "2026-05-02T00:00:00.000Z",
      tasksByStatus: {},
      runsByAgent: {},
      runsByStatus: {},
      totalTaskCount: 5,
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
    });

    const first = await app.inject({ method: "GET", url: "/alerts/pending" });
    const second = await app.inject({ method: "GET", url: "/alerts/pending" });
    await app.close();

    expect(first.json().alerts).toHaveLength(1);
    expect(second.json().alerts).toHaveLength(0);
  });

  it("returns configured alert rules", async () => {
    const { app } = await createApp();

    const response = await app.inject({ method: "GET", url: "/alerts/rules" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().rules[0].id).toBe(rule.id);
  });
});

