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
    return {
      tasksNeedingRecovery: 0,
      runsNeedingRecovery: 0
    };
  }

  async rebuildProjectionsIfNeeded() {}
}
