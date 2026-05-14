import type { TaskProjectionRecord } from "../persistence/task-read-model";

export interface MetricsTaskSource {
  listTasks(): Promise<TaskProjectionRecord[]>;
}

export interface SystemMetricsSnapshot {
  timestamp: string;
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    recoveryRequired: number;
    awaitingApproval: number;
  };
  runs: {
    total: number;
    byStatus: Record<string, number>;
    byAgent: Record<string, number>;
  };
}

function increment(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}

export class MetricsService {
  readonly #source: MetricsTaskSource;
  readonly #ttlMs: number;
  readonly #now: () => number;
  #cached:
    | {
        expiresAt: number;
        snapshot: SystemMetricsSnapshot;
      }
    | undefined;

  constructor(options: {
    source: MetricsTaskSource;
    ttlMs?: number;
    now?: () => number;
  }) {
    this.#source = options.source;
    this.#ttlMs = options.ttlMs ?? 1000;
    this.#now = options.now ?? Date.now;
  }

  async getMetrics(options?: { refresh?: boolean }) {
    if (!options?.refresh && this.#cached && this.#cached.expiresAt > this.#now()) {
      return this.#cached.snapshot;
    }

    return this.refreshMetrics();
  }

  async refreshMetrics() {
    const tasks = await this.#source.listTasks();
    const taskCountByStatus: Record<string, number> = {};
    const runCountByStatus: Record<string, number> = {};
    const runCountByAgent: Record<string, number> = {};
    let totalRuns = 0;
    let recoveryRequired = 0;
    let awaitingApproval = 0;

    for (const task of tasks) {
      increment(taskCountByStatus, task.status);

      if (task.recoveryState !== "healthy") {
        recoveryRequired += 1;
      }

      if (task.status === "awaiting_approval") {
        awaitingApproval += 1;
      }

      for (const run of task.runs) {
        totalRuns += 1;
        increment(runCountByStatus, run.status);
        increment(runCountByAgent, run.agent);
      }
    }

    const snapshot: SystemMetricsSnapshot = {
      timestamp: new Date().toISOString(),
      tasks: {
        total: tasks.length,
        byStatus: taskCountByStatus,
        recoveryRequired,
        awaitingApproval
      },
      runs: {
        total: totalRuns,
        byStatus: runCountByStatus,
        byAgent: runCountByAgent
      }
    };

    this.#cached = {
      expiresAt: this.#now() + this.#ttlMs,
      snapshot
    };

    return snapshot;
  }
}
