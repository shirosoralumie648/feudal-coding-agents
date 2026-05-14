import type { FastifyInstance } from "fastify";
import type { AlertRule } from "@feudal/contracts";
import type { AlertService } from "../services/alert-service";

interface AlertRoutesOptions {
  alertService: AlertService;
  rules?: AlertRule[];
}

type AlertRoutePrefix = "/alerts" | "/api/alerts";

interface AlertStateResponse {
  states: ReturnType<AlertService["getAlertStates"]>;
}

interface PendingAlertsResponse {
  alerts: ReturnType<AlertService["getPendingAlerts"]>;
}

interface AlertRulesResponse {
  rules: AlertRule[];
}

function stateResponse(options: AlertRoutesOptions): AlertStateResponse {
  return {
    states: options.alertService.getAlertStates()
  };
}

function pendingResponse(options: AlertRoutesOptions): PendingAlertsResponse {
  return {
    alerts: options.alertService.getPendingAlerts()
  };
}

function rulesResponse(options: AlertRoutesOptions): AlertRulesResponse {
  return {
    rules: options.rules ?? options.alertService.getRules()
  };
}

function registerAlertRoutePrefix(
  app: FastifyInstance,
  prefix: AlertRoutePrefix,
  options: AlertRoutesOptions
) {
  app.get(`${prefix}/state`, async () => stateResponse(options));
  app.get(`${prefix}/pending`, async () => pendingResponse(options));
  app.get(`${prefix}/rules`, async () => rulesResponse(options));
}

export function registerAlertRoutes(
  app: FastifyInstance,
  options: AlertRoutesOptions
) {
  registerAlertRoutePrefix(app, "/alerts", options);
  registerAlertRoutePrefix(app, "/api/alerts", options);
}
