import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import {
  defaultOrchestratorService,
  defaultPluginDiscovery,
  defaultPluginExtensionCatalog,
  defaultPluginStore,
  defaultTemplateEngine,
  defaultTemplateStore
} from "./config";
import { registerAgentRoutes } from "./routes/agents";
import { registerAlertRoutes } from "./routes/alerts";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerMetricsRoutes } from "./routes/metrics";
import { registerOperatorActionRoutes } from "./routes/operator-actions";
import { registerPluginRoutes } from "./routes/plugins";
import { registerReplayRoutes } from "./routes/replay";
import { registerRoleRoutes } from "./routes/roles";
import { registerTaskRoutes } from "./routes/tasks";
import { registerTemplateRoutes } from "./routes/templates";
import { AlertService } from "./services/alert-service";
import { AnalyticsService } from "./services/analytics-service";
import { MetricsService } from "./services/metrics-service";
import type { OrchestratorService } from "./services/orchestrator-service";
import type { PluginDiscovery } from "./services/plugin-discovery";
import type { PluginExtensionCatalog } from "./services/plugin-extension-catalog";
import type { PluginStore } from "./services/plugin-store";

export function createControlPlaneApp(options?: {
  logger?: boolean;
  onReady?: () => Promise<void>;
  service?: OrchestratorService;
  analyticsService?: AnalyticsService;
  alertService?: AlertService;
  metricsService?: MetricsService;
  pluginStore?: PluginStore;
  pluginDiscovery?: PluginDiscovery;
  pluginExtensionCatalog?: PluginExtensionCatalog;
}) {
  const app = Fastify({ logger: options?.logger ?? true });
  const service = options?.service ?? defaultOrchestratorService;
  const analyticsService =
    options?.analyticsService ??
    new AnalyticsService({
      store: service,
      intervalMs: 10000
    });
  const metricsService =
    options?.metricsService ?? new MetricsService({ source: service });
  const alertRules = AlertService.loadRules();
  const alertService =
    options?.alertService ??
    new AlertService({
      rules: alertRules,
      webhookUrl: process.env.ALERT_WEBHOOK_URL,
      analyticsService
    });

  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);
  registerTemplateRoutes(app, {
    store: defaultTemplateStore,
    engine: defaultTemplateEngine
  });
  registerPluginRoutes(app, {
    store: options?.pluginStore ?? defaultPluginStore,
    discovery: options?.pluginDiscovery ?? defaultPluginDiscovery,
    extensionCatalog:
      options?.pluginExtensionCatalog ?? defaultPluginExtensionCatalog
  });
  registerOperatorActionRoutes(app, service);
  registerReplayRoutes(app, service);
  registerMetricsRoutes(app, { metricsService });
  registerAnalyticsRoutes(app, { analyticsService });
  registerAlertRoutes(app, { alertService, rules: alertRules });
  registerRoleRoutes(app);

  app.addHook("onReady", async () => {
    await service.rebuildProjectionsIfNeeded();
    await analyticsService.pollMetrics();
    analyticsService.start();
    alertService.start();
    await options?.onReady?.();
  });

  app.addHook("onClose", async () => {
    alertService.stop();
    analyticsService.stop();
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createControlPlaneApp();
  const port = Number(process.env.PORT ?? 4000);

  app.listen({ host: "0.0.0.0", port }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
