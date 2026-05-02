import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  AlertEvent,
  AlertRule,
  AlertState,
  MetricEventEmitter,
  MetricListener,
  MetricSnapshot,
  WebhookPayload
} from "@feudal/contracts";
import { AlertRuleSchema, WebhookPayloadSchema } from "@feudal/contracts";

const DEFAULT_RULE_PATH = fileURLToPath(
  new URL("../../config/alert-rules.json", import.meta.url)
);

function initialState(rule: AlertRule): AlertState {
  return {
    ruleId: rule.id,
    status: "ok",
    currentValue: 0,
    threshold: rule.threshold
  };
}

function compareMetric(value: number, operator: AlertRule["operator"], threshold: number) {
  if (operator === "gt") {
    return value > threshold;
  }

  if (operator === "gte") {
    return value >= threshold;
  }

  if (operator === "lt") {
    return value < threshold;
  }

  if (operator === "lte") {
    return value <= threshold;
  }

  return value === threshold;
}

function getStateTime(state: AlertState) {
  const timestamp = state.lastSuppressedAt ?? state.triggeredAt;
  return timestamp ? new Date(timestamp).getTime() : 0;
}

function buildMessage(rule: AlertRule, state: AlertState, status: AlertEvent["status"]) {
  if (status === "resolved") {
    return `${rule.name} recovered to ${state.currentValue} (threshold: ${state.threshold})`;
  }

  return `${rule.name} is ${state.currentValue} (threshold: ${state.threshold})`;
}

function buildWebhookPayload(event: AlertEvent): WebhookPayload {
  return WebhookPayloadSchema.parse({
    text: `Alert: ${event.ruleName}`,
    attachments: [
      {
        color: event.status === "resolved" ? "good" : "danger",
        title: event.ruleName,
        fields: [
          {
            title: "Metric",
            value: String(event.metricValue),
            short: true
          },
          {
            title: "Threshold",
            value: String(event.threshold),
            short: true
          },
          {
            title: "Status",
            value: event.status.toUpperCase(),
            short: true
          }
        ],
        footer: event.timestamp
      }
    ]
  });
}

export class AlertService implements MetricListener {
  readonly #rules: AlertRule[];
  readonly #webhookUrl: string | undefined;
  readonly #analyticsService: MetricEventEmitter;
  readonly #states = new Map<string, AlertState>();
  readonly #pendingAlerts: AlertEvent[] = [];
  #unsubscribe: (() => void) | undefined;

  constructor(options: {
    rules: AlertRule[];
    webhookUrl?: string;
    analyticsService: MetricEventEmitter;
  }) {
    this.#rules = options.rules.map((rule) => AlertRuleSchema.parse(rule));
    this.#webhookUrl = options.webhookUrl;
    this.#analyticsService = options.analyticsService;

    for (const rule of this.#rules) {
      this.#states.set(rule.id, initialState(rule));
    }
  }

  static loadRules(path = DEFAULT_RULE_PATH) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return AlertRuleSchema.array().parse(raw);
  }

  start() {
    if (this.#unsubscribe) {
      return;
    }

    this.#unsubscribe = this.#analyticsService.subscribe(this);
    const latest = this.#analyticsService.getLatestSnapshot();

    if (latest) {
      this.onMetricSnapshot(latest);
    }
  }

  stop() {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  onMetricSnapshot(snapshot: MetricSnapshot) {
    this.evaluate(snapshot);
  }

  evaluate(snapshot: MetricSnapshot) {
    for (const rule of this.#rules) {
      if (!rule.enabled) {
        continue;
      }

      this.#evaluateRule(rule, snapshot);
    }
  }

  getAlertStates() {
    return [...this.#states.values()];
  }

  getPendingAlerts() {
    const alerts = [...this.#pendingAlerts];
    this.#pendingAlerts.length = 0;
    return alerts;
  }

  getRules() {
    return [...this.#rules];
  }

  #evaluateRule(rule: AlertRule, snapshot: MetricSnapshot) {
    const value = snapshot[rule.metricField];

    if (value === null || value === undefined) {
      return;
    }

    const state = this.#states.get(rule.id) ?? initialState(rule);
    const now = new Date();
    const nowIso = now.toISOString();
    const triggered = compareMetric(value, rule.operator, rule.threshold);

    if (triggered) {
      this.#handleTriggered(rule, state, value, now, nowIso);
      return;
    }

    this.#handleRecovered(rule, state, value, nowIso);
  }

  #handleTriggered(
    rule: AlertRule,
    state: AlertState,
    value: number,
    now: Date,
    nowIso: string
  ) {
    if (state.status === "firing" || state.status === "suppressed") {
      const elapsed = now.getTime() - getStateTime(state);

      if (elapsed < rule.suppressionWindowMs) {
        this.#states.set(rule.id, {
          ...state,
          status: "suppressed",
          currentValue: value,
          threshold: rule.threshold,
          lastSuppressedAt: nowIso
        });
        return;
      }
    }

    const nextState: AlertState = {
      ruleId: rule.id,
      status: "firing",
      triggeredAt: nowIso,
      currentValue: value,
      threshold: rule.threshold
    };
    this.#states.set(rule.id, nextState);
    this.#dispatchAlert(rule, nextState, "firing");
  }

  #handleRecovered(rule: AlertRule, state: AlertState, value: number, nowIso: string) {
    if (state.status !== "firing" && state.status !== "suppressed") {
      this.#states.set(rule.id, {
        ...state,
        status: "ok",
        currentValue: value,
        threshold: rule.threshold
      });
      return;
    }

    const resolvedState: AlertState = {
      ruleId: rule.id,
      status: "resolved",
      triggeredAt: state.triggeredAt,
      resolvedAt: nowIso,
      currentValue: value,
      threshold: rule.threshold
    };
    this.#states.set(rule.id, resolvedState);
    this.#dispatchAlert(rule, resolvedState, "resolved");
    this.#states.set(rule.id, {
      ...resolvedState,
      status: "ok"
    });
  }

  #dispatchAlert(
    rule: AlertRule,
    state: AlertState,
    status: AlertEvent["status"]
  ) {
    const event = {
      id: randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      status,
      message: buildMessage(rule, state, status),
      metricValue: state.currentValue,
      threshold: state.threshold,
      timestamp: new Date().toISOString()
    } satisfies AlertEvent;

    if (rule.notificationChannels.includes("in-app")) {
      this.#pendingAlerts.push(event);
    }

    if (rule.notificationChannels.includes("webhook") && this.#webhookUrl) {
      const payload = buildWebhookPayload(event);
      void fetch(this.#webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  }
}

