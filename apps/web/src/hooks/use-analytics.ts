import { startTransition, useCallback, useEffect, useState } from "react";
import type { MetricSnapshot } from "@feudal/contracts";
import { fetchAnalyticsSnapshot, subscribeAnalytics } from "../lib/api";

interface UseAnalyticsReturn {
  snapshot: MetricSnapshot | null;
  connected: boolean;
  error: string | undefined;
  snapshotHistory: MetricSnapshot[];
}

function isNoDataResponse(
  value: MetricSnapshot | { status: string; message: string }
): value is { status: string; message: string } {
  return "status" in value && value.status === "no_data";
}

export function useAnalytics(): UseAnalyticsReturn {
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>();
  const [snapshotHistory, setSnapshotHistory] = useState<MetricSnapshot[]>([]);

  const addSnapshot = useCallback((next: MetricSnapshot) => {
    setSnapshotHistory((current) => {
      const updated = [...current, next];
      return updated.length > 100 ? updated.slice(-100) : updated;
    });
  }, []);

  useEffect(() => {
    let active = true;

    fetchAnalyticsSnapshot()
      .then((data) => {
        if (!active || isNoDataResponse(data)) {
          return;
        }

        startTransition(() => {
          setSnapshot(data);
          addSnapshot(data);
        });
      })
      .catch((nextError: unknown) => {
        if (!active) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load analytics"
        );
      });

    const subscription = subscribeAnalytics(
      (nextSnapshot) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setSnapshot(nextSnapshot);
          setConnected(true);
          setError(undefined);
          addSnapshot(nextSnapshot);
        });
      },
      () => {
        if (!active) {
          return;
        }

        setConnected(false);
        setError("Analytics stream disconnected");
      }
    );
    const timer = window.setTimeout(() => {
      if (active) {
        setConnected(true);
      }
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timer);
      subscription.close();
    };
  }, [addSnapshot]);

  return { snapshot, connected, error, snapshotHistory };
}

