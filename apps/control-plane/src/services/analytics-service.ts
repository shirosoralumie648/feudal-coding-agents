import type {
  AuditEvent,
  MetricEventEmitter,
  MetricListener,
  MetricSnapshot,
  SystemTokenUsageSummary
} from "@feudal/contracts";
import { MetricSnapshotSchema } from "@feudal/contracts";
import type { createPostgresEventStore } from "@feudal/persistence";
import type { TaskProjectionRecord } from "../persistence/task-read-model";
import type { TaskStore } from "../store";

type AnalyticsEventStore = Pick<
  ReturnType<typeof createPostgresEventStore>,
  "append" | "loadAfter"
>;

type AnalyticsTaskSource = Pick<TaskStore, "listTasks" | "listTaskEvents"> &
  Partial<Pick<TaskStore, "listAuditEventsAfter">>;

const ZERO_TOKEN_USAGE: SystemTokenUsageSummary = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  byAgent: []
};

function increment(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}

function toTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function computeApprovalLatency(tasks: TaskProjectionRecord[]) {
  const latencies: number[] = [];

  for (const task of tasks) {
    for (let index = 0; index < task.history.length - 1; index += 1) {
      const entry = task.history[index];
      const nextEntry = task.history[index + 1];

      if (!entry || !nextEntry || entry.status !== "awaiting_approval") {
        continue;
      }

      const start = toTime(entry.at);
      const end = toTime(nextEntry.at);

      if (start !== undefined && end !== undefined && end >= start) {
        latencies.push(end - start);
      }
    }
  }

  if (latencies.length === 0) {
    return null;
  }

  return latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
}

function computeTokenUsage(_tasks: TaskProjectionRecord[]): SystemTokenUsageSummary {
  return ZERO_TOKEN_USAGE;
}

export class AnalyticsService implements MetricEventEmitter {
  readonly #store: AnalyticsTaskSource;
  readonly #intervalMs: number;
  readonly #eventStore: AnalyticsEventStore | undefined;
  readonly #listeners = new Set<MetricListener>();
  #intervalId: ReturnType<typeof setInterval> | undefined;
  #latestSnapshot: MetricSnapshot | undefined;
  #snapshotVersion = 0;

  constructor(options: {
    store: AnalyticsTaskSource;
    intervalMs?: number;
    eventStore?: AnalyticsEventStore;
  }) {
    this.#store = options.store;
    this.#intervalMs = options.intervalMs ?? 10000;
    this.#eventStore = options.eventStore;
  }

  start() {
    if (this.#intervalId) {
      return;
    }

    this.#intervalId = setInterval(() => {
      void this.pollMetrics();
    }, this.#intervalMs);
  }

  stop() {
    if (!this.#intervalId) {
      return;
    }

    clearInterval(this.#intervalId);
    this.#intervalId = undefined;
  }

  subscribe(listener: MetricListener) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  getLatestSnapshot() {
    return this.#latestSnapshot;
  }

  async pollMetrics() {
    const tasks = await this.#store.listTasks();
    const tasksByStatus: Record<string, number> = {};
    const runsByAgent: Record<string, number> = {};
    const runsByStatus: Record<string, number> = {};
    let totalRunCount = 0;
    let awaitingApproval = 0;
    let recoveryRequired = 0;
    let failedTasks = 0;

    for (const task of tasks) {
      increment(tasksByStatus, task.status);

      if (task.status === "awaiting_approval") {
        awaitingApproval += 1;
      }

      if (task.recoveryState === "recovery_required") {
        recoveryRequired += 1;
      }

      if (task.status === "failed" || task.status === "partial_success") {
        failedTasks += 1;
      }

      for (const run of task.runs) {
        totalRunCount += 1;
        increment(runsByAgent, run.agent);
        increment(runsByStatus, run.status);
      }
    }

    const snapshot = MetricSnapshotSchema.parse({
      timestamp: new Date().toISOString(),
      tasksByStatus,
      runsByAgent,
      runsByStatus,
      totalTaskCount: tasks.length,
      totalRunCount,
      awaitingApproval,
      recoveryRequired,
      avgApprovalLatencyMs: computeApprovalLatency(tasks),
      errorRate: tasks.length === 0 ? 0 : failedTasks / tasks.length,
      tokenUsage: computeTokenUsage(tasks)
    });

    this.#latestSnapshot = snapshot;

    for (const listener of this.#listeners) {
      listener.onMetricSnapshot(snapshot);
    }

    await this.#persistSnapshot(snapshot);
    return snapshot;
  }

  async loadAuditEvents(cursor = 0): Promise<AuditEvent[]> {
    if (this.#eventStore) {
      return this.#eventStore.loadAfter(cursor) as Promise<AuditEvent[]>;
    }

    if (this.#store.listAuditEventsAfter) {
      return this.#store.listAuditEventsAfter(cursor);
    }

    const tasks = await this.#store.listTasks();
    const events = await Promise.all(
      tasks.map((task) => this.#store.listTaskEvents(task.id))
    );

    return events
      .flatMap((taskEvents) => taskEvents ?? [])
      .filter((event) => event.id > cursor)
      .sort((left, right) => left.id - right.id);
  }

  async #persistSnapshot(snapshot: MetricSnapshot) {
    if (!this.#eventStore) {
      return;
    }

    const appended = await this.#eventStore.append({
      streamType: "analytics_snapshot",
      streamId: "global",
      expectedVersion: this.#snapshotVersion,
      events: [
        {
          eventType: "analytics.snapshot_recorded",
          payloadJson: { snapshot },
          metadataJson: {
            actorType: "system",
            actorId: "analytics-service"
          }
        }
      ]
    });

    this.#snapshotVersion += appended.length;
  }
}
