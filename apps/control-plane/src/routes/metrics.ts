import type { FastifyInstance } from "fastify";
import type { SystemTokenUsageSummary } from "@feudal/contracts";
import type { MetricsService } from "../services/metrics-service";

export function registerMetricsRoutes(
  app: FastifyInstance,
  options?: { metricsService?: Pick<MetricsService, "getMetrics"> }
) {
  const metricsService = options?.metricsService;

  app.get("/metrics", async () => {
    if (!metricsService) {
      return {
        status: "metrics_unavailable",
        message: "No store configured for metrics collection"
      };
    }

    return metricsService.getMetrics();
  });

  app.get("/metrics/tokens", async (): Promise<SystemTokenUsageSummary> => {
    // Placeholder for token usage metrics
    // In a real implementation, this would aggregate token usage from run records
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      byAgent: []
    };
  });

  app.get("/metrics/health", async () => {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown"
    };
  });
}
