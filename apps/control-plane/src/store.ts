import type {
  ACPRunSummary,
  AuditEvent,
  OperatorActionRecord,
  OperatorActionSummary,
  OperatorActionType,
  TaskArtifact,
  TaskRecord
} from "@feudal/contracts";
import {
  buildTaskEventInputs,
  isTaskDiffEvent,
  taskFromAuditEvent,
  toTaskProjectionRecord
} from "./persistence/task-event-codec";
import type { TaskProjectionRecord } from "./persistence/task-read-model";

function toEventVersionMismatchError(taskId: string) {
  return new Error(`Event version mismatch for task:${taskId}`);
}

export interface TaskStore {
  listTasks(): Promise<TaskProjectionRecord[]>;
  getTask(taskId: string): Promise<TaskProjectionRecord | undefined>;
  saveTask(
    task: TaskRecord,
    eventType: string,
    expectedVersion: number
  ): Promise<TaskProjectionRecord>;
  recordOperatorAction(
    input:
      | {
          taskId: string;
          actionType: OperatorActionType;
          status: "requested";
          note: string;
          actorType?: string;
          actorId?: string;
          payloadJson?: Record<string, unknown>;
        }
      | {
          taskId: string;
          actionType: OperatorActionType;
          status: "applied";
          note: string;
          appliedAt: string;
          actorType?: string;
          actorId?: string;
          payloadJson?: Record<string, unknown>;
        }
      | {
          taskId: string;
          actionType: OperatorActionType;
          status: "rejected";
          note: string;
          rejectedAt: string;
          rejectionReason: string;
          actorType?: string;
          actorId?: string;
          payloadJson?: Record<string, unknown>;
        }
  ): Promise<void>;
  listOperatorActions(taskId: string): Promise<OperatorActionRecord[] | undefined>;
  getOperatorActionSummary(): Promise<OperatorActionSummary>;
  listTaskEvents(taskId: string): Promise<AuditEvent[] | undefined>;
  listAuditEventsAfter(cursor?: number): Promise<AuditEvent[]>;
  listTaskDiffs(taskId: string): Promise<AuditEvent[] | undefined>;
  listTaskRuns(taskId: string): Promise<ACPRunSummary[] | undefined>;
  listTaskArtifacts(taskId: string): Promise<TaskArtifact[] | undefined>;
  replayTaskAtEventId(
    taskId: string,
    eventId: number
  ): Promise<{ task: TaskProjectionRecord } | undefined>;
  getRecoverySummary(): Promise<{
    tasksNeedingRecovery: number;
    runsNeedingRecovery: number;
    taskBreakdown: {
      healthy: number;
      replaying: number;
      recoveryRequired: number;
    };
    runRecoveryBreakdown: {
      healthy: number;
      replaying: number;
      recoveryRequired: number;
    };
    runStatusBreakdown: {
      created: number;
      inProgress: number;
      awaiting: number;
      completed: number;
      failed: number;
      cancelling: number;
      cancelled: number;
    };
  }>;
  rebuildProjectionsIfNeeded(): Promise<void>;
}

export class MemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, TaskProjectionRecord>();
  private readonly events = new Map<string, AuditEvent[]>();
  private readonly operatorActions = new Map<string, OperatorActionRecord[]>();
  private nextEventId = 1;
  private nextOperatorActionId = 1;

  async listTasks() {
    return [...this.tasks.values()];
  }

  async getTask(taskId: string) {
    return this.tasks.get(taskId);
  }

  async saveTask(task: TaskRecord, eventType: string, expectedVersion: number) {
    const existingEvents = this.events.get(task.id) ?? [];
    const currentVersion = existingEvents.at(-1)?.eventVersion ?? 0;
    const previousTask = this.tasks.get(task.id);

    if (currentVersion !== expectedVersion) {
      throw toEventVersionMismatchError(task.id);
    }

    const occurredAt = task.updatedAt;
    const appendedEvents = buildTaskEventInputs(task, eventType, previousTask).map(
      (event, offset) => ({
        id: this.nextEventId++,
        streamType: "task",
        streamId: task.id,
        eventType: event.eventType,
        eventVersion: expectedVersion + offset + 1,
        occurredAt,
        payloadJson: event.payloadJson,
        metadataJson: event.metadataJson
      })
    ) satisfies AuditEvent[];
    const latestEvent = appendedEvents.at(-1);
    const projection = toTaskProjectionRecord({
      task,
      latestEventId: latestEvent?.id ?? 0,
      latestProjectionVersion: latestEvent?.eventVersion ?? expectedVersion
    });

    this.events.set(task.id, [...existingEvents, ...appendedEvents]);
    this.tasks.set(task.id, projection);

    return projection;
  }

  async recordOperatorAction(
    input:
      | {
          taskId: string;
          actionType: OperatorActionType;
          status: "requested";
          note: string;
          actorType?: string;
          actorId?: string;
          payloadJson?: Record<string, unknown>;
        }
      | {
          taskId: string;
          actionType: OperatorActionType;
          status: "applied";
          note: string;
          appliedAt: string;
          actorType?: string;
          actorId?: string;
          payloadJson?: Record<string, unknown>;
        }
      | {
          taskId: string;
          actionType: OperatorActionType;
          status: "rejected";
          note: string;
          rejectedAt: string;
          rejectionReason: string;
          actorType?: string;
          actorId?: string;
          payloadJson?: Record<string, unknown>;
        }
  ) {
    const current = this.operatorActions.get(input.taskId) ?? [];
    const createdAt = new Date().toISOString();
    const baseRecord = {
      id: this.nextOperatorActionId++,
      taskId: input.taskId,
      actionType: input.actionType,
      note: input.note,
      actorType: input.actorType ?? "operator",
      actorId: input.actorId,
      createdAt
    };
    let record: OperatorActionRecord;

    if (input.status === "requested") {
      record = {
        ...baseRecord,
        status: input.status
      };
    } else if (input.status === "applied") {
      record = {
        ...baseRecord,
        status: input.status,
        appliedAt: input.appliedAt
      };
    } else {
      record = {
        ...baseRecord,
        status: input.status,
        rejectedAt: input.rejectedAt,
        rejectionReason: input.rejectionReason
      };
    }

    this.operatorActions.set(input.taskId, [...current, record]);
  }

  async listOperatorActions(taskId: string) {
    if (!this.tasks.has(taskId)) {
      return undefined;
    }

    return [...(this.operatorActions.get(taskId) ?? [])];
  }

  async getOperatorActionSummary() {
    const tasks = [...this.tasks.values()]
      .filter(
        (task) => task.status === "failed" || task.recoveryState === "recovery_required"
      )
      .sort((left, right) => {
        const leftPriority = left.recoveryState === "recovery_required" ? 1 : 0;
        const rightPriority = right.recoveryState === "recovery_required" ? 1 : 0;

        return rightPriority - leftPriority;
      });

    return {
      tasksNeedingOperatorAttention: tasks.length,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        recoveryState: task.recoveryState,
        recoveryReason: task.recoveryReason,
        operatorAllowedActions: task.operatorAllowedActions
      }))
    };
  }

  async listTaskEvents(taskId: string) {
    if (!this.tasks.has(taskId)) {
      return undefined;
    }

    return [...(this.events.get(taskId) ?? [])];
  }

  async listAuditEventsAfter(cursor = 0) {
    return [...this.events.values()]
      .flatMap((events) => events)
      .filter((event) => event.id > cursor)
      .sort((left, right) => left.id - right.id);
  }

  async listTaskDiffs(taskId: string) {
    const events = await this.listTaskEvents(taskId);
    return events?.filter((event) => isTaskDiffEvent(event));
  }

  async listTaskRuns(taskId: string) {
    return (await this.getTask(taskId))?.runs;
  }

  async listTaskArtifacts(taskId: string) {
    return (await this.getTask(taskId))?.artifacts;
  }

  async replayTaskAtEventId(taskId: string, eventId: number) {
    const taskEvents = await this.listTaskEvents(taskId);

    if (!taskEvents) {
      return undefined;
    }

    const events = taskEvents.filter((event) => event.id <= eventId);
    const latestEvent = events.at(-1);

    if (!latestEvent) {
      return undefined;
    }

    let latestTask: TaskRecord | undefined;

    for (const event of events) {
      const task = taskFromAuditEvent(event);

      if (task) {
        latestTask = task;
      }
    }

    if (!latestTask) {
      return undefined;
    }

    return {
      task: toTaskProjectionRecord({
        task: latestTask,
        latestEventId: latestEvent.id,
        latestProjectionVersion: latestEvent.eventVersion
      })
    };
  }

  async getRecoverySummary() {
    const taskBreakdown = {
      healthy: 0,
      replaying: 0,
      recoveryRequired: 0
    };
    const runRecoveryBreakdown = {
      healthy: 0,
      replaying: 0,
      recoveryRequired: 0
    };
    const runStatusBreakdown = {
      created: 0,
      inProgress: 0,
      awaiting: 0,
      completed: 0,
      failed: 0,
      cancelling: 0,
      cancelled: 0
    };

    for (const task of this.tasks.values()) {
      if (task.recoveryState === "recovery_required") {
        taskBreakdown.recoveryRequired += 1;
      } else if (task.recoveryState === "replaying") {
        taskBreakdown.replaying += 1;
      } else {
        taskBreakdown.healthy += 1;
      }

      for (const run of task.runs) {
        if (run.status === "created") {
          runStatusBreakdown.created += 1;
          runRecoveryBreakdown.recoveryRequired += 1;
        } else if (run.status === "in-progress") {
          runStatusBreakdown.inProgress += 1;
          runRecoveryBreakdown.recoveryRequired += 1;
        } else if (run.status === "awaiting") {
          runStatusBreakdown.awaiting += 1;
          runRecoveryBreakdown.healthy += 1;
        } else if (run.status === "completed") {
          runStatusBreakdown.completed += 1;
          runRecoveryBreakdown.healthy += 1;
        } else if (run.status === "failed") {
          runStatusBreakdown.failed += 1;
          runRecoveryBreakdown.healthy += 1;
        } else if (run.status === "cancelling") {
          runStatusBreakdown.cancelling += 1;
          runRecoveryBreakdown.recoveryRequired += 1;
        } else if (run.status === "cancelled") {
          runStatusBreakdown.cancelled += 1;
          runRecoveryBreakdown.healthy += 1;
        }
      }
    }

    return {
      tasksNeedingRecovery: taskBreakdown.recoveryRequired,
      runsNeedingRecovery: runRecoveryBreakdown.recoveryRequired,
      taskBreakdown,
      runRecoveryBreakdown,
      runStatusBreakdown
    };
  }

  async rebuildProjectionsIfNeeded() {}
}
