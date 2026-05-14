import { useCallback, useEffect, useState } from "react";
import type { AlertEvent, AlertState } from "@feudal/contracts";
import { fetchAlertStates, fetchPendingAlerts } from "../lib/api";

function alertCountLabel(count: number) {
  if (count === 0) {
    return "No alerts";
  }

  return `${count} alert${count === 1 ? "" : "s"}`;
}

function activeStateCount(states: AlertState[]) {
  return states.filter(
    (state) => state.status === "firing" || state.status === "suppressed"
  ).length;
}

function formatAlertTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function mergeAlerts(current: AlertEvent[], incoming: AlertEvent[]) {
  const seen = new Set<string>();
  const merged: AlertEvent[] = [];

  for (const alert of [...incoming, ...current]) {
    if (seen.has(alert.id)) {
      continue;
    }

    seen.add(alert.id);
    merged.push(alert);
  }

  return merged;
}

export function AlertPanel() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [states, setStates] = useState<AlertState[]>([]);
  const [error, setError] = useState<string>();

  const pollAlerts = useCallback(async (active: () => boolean) => {
    try {
      const [pendingResponse, stateResponse] = await Promise.all([
        fetchPendingAlerts(),
        fetchAlertStates()
      ]);

      if (!active()) {
        return;
      }

      if (pendingResponse.alerts.length > 0) {
        setAlerts((current) => mergeAlerts(current, pendingResponse.alerts));
      }
      setStates(stateResponse.states);
      setError(undefined);
    } catch (nextError: unknown) {
      if (!active()) {
        return;
      }

      setError(
        nextError instanceof Error ? nextError.message : "Failed to fetch alerts"
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    const isActive = () => active;

    void pollAlerts(isActive);
    const interval = window.setInterval(() => {
      void pollAlerts(isActive);
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pollAlerts]);

  const activeRules = activeStateCount(states);

  return (
    <section className="panel panel-alerts" aria-live="polite">
      <div className="panel-header">
        <div>
          <h2>Alerts</h2>
          <span>{alertCountLabel(alerts.length)}</span>
        </div>
        <div className="button-row">
          {activeRules > 0 ? (
            <span className="alert-rule-count">{activeRules} active rules</span>
          ) : null}
          {alerts.length > 0 ? (
            <button type="button" onClick={() => setAlerts([])}>
              Dismiss All
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      {alerts.length === 0 ? (
        <p className="status-message">No active alerts</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`alert-item alert-${alert.status}`}
            >
              <div className="alert-header">
                <strong
                  className={
                    alert.status === "firing" ? "text-danger" : "text-success"
                  }
                >
                  {alert.status === "firing" ? "FIRING" : "RESOLVED"}
                </strong>
                <span>{alert.ruleName}</span>
                <time dateTime={alert.timestamp}>
                  {formatAlertTime(alert.timestamp)}
                </time>
              </div>
              <p className="alert-message">{alert.message}</p>
              <button
                type="button"
                className="alert-dismiss"
                onClick={() =>
                  setAlerts((current) =>
                    current.filter((currentAlert) => currentAlert.id !== alert.id)
                  )
                }
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
