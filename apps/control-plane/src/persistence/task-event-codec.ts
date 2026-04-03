import {
  AuditEventSchema,
  TaskRecordSchema,
  type AuditEvent,
  type TaskRecord
} from "@feudal/contracts";
import type { TaskProjectionRecord } from "./task-read-model";

const CONTROL_PLANE_METADATA = { actorType: "control-plane" } as const;
const TRACKED_DIFF_FIELDS = ["status", "approvalRequest", "runs"] as const;

type DiffField = (typeof TRACKED_DIFF_FIELDS)[number];

function hasOwnValue(
  task: TaskRecord | undefined,
  field: DiffField
): task is TaskRecord {
  return task !== undefined && task[field] !== undefined;
}

function isEqualValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toTaskSnapshot(task: TaskRecord) {
  return TaskRecordSchema.parse(task);
}

function toDiffPayload(task: TaskRecord, previousTask?: TaskRecord) {
  const beforeSubsetJson: Record<string, unknown> = {};
  const afterSubsetJson: Record<string, unknown> = {};
  const patchJson: Array<
    { op: "add" | "replace"; path: string; value: unknown } | { op: "remove"; path: string }
  > = [];
  const changedPaths: string[] = [];

  for (const field of TRACKED_DIFF_FIELDS) {
    const beforeHasValue = hasOwnValue(previousTask, field);
    const afterHasValue = hasOwnValue(task, field);
    const beforeValue = previousTask?.[field];
    const afterValue = task[field];
    const changed =
      previousTask === undefined
        ? afterHasValue
        : beforeHasValue !== afterHasValue || !isEqualValue(beforeValue, afterValue);

    if (!changed) {
      continue;
    }

    const path = `/${field}`;
    changedPaths.push(path);

    if (beforeHasValue) {
      beforeSubsetJson[field] = beforeValue;
    }

    if (afterHasValue) {
      afterSubsetJson[field] = afterValue;
    }

    if (!beforeHasValue && afterHasValue) {
      patchJson.push({ op: "add", path, value: afterValue });
      continue;
    }

    if (beforeHasValue && !afterHasValue) {
      patchJson.push({ op: "remove", path });
      continue;
    }

    patchJson.push({ op: "replace", path, value: afterValue });
  }

  return {
    targetType: "task",
    targetId: task.id,
    beforeSubsetJson,
    afterSubsetJson,
    patchJson,
    changedPaths
  } satisfies Record<string, unknown>;
}

function toIsoString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

export function buildTaskEventInputs(
  task: TaskRecord,
  eventType: string,
  previousTask?: TaskRecord
) {
  const taskSnapshot = toTaskSnapshot(task);
  const previousSnapshot = previousTask ? toTaskSnapshot(previousTask) : undefined;

  return [
    {
      eventType,
      payloadJson: taskSnapshot as unknown as Record<string, unknown>,
      metadataJson: { ...CONTROL_PLANE_METADATA }
    },
    {
      eventType: "task.diff_recorded",
      payloadJson: toDiffPayload(taskSnapshot, previousSnapshot),
      metadataJson: { ...CONTROL_PLANE_METADATA }
    }
  ] satisfies {
    eventType: string;
    payloadJson: Record<string, unknown>;
    metadataJson: Record<string, unknown>;
  }[];
}

export function toAuditEvent(row: {
  id: number;
  streamType: string;
  streamId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: unknown;
  payloadJson: unknown;
  metadataJson: unknown;
}): AuditEvent {
  return AuditEventSchema.parse({
    ...row,
    occurredAt: toIsoString(row.occurredAt),
    payloadJson: (row.payloadJson ?? {}) as Record<string, unknown>,
    metadataJson: (row.metadataJson ?? {}) as Record<string, unknown>
  });
}

export function toTaskProjectionRecord(input: {
  task: TaskRecord;
  latestEventId: number;
  latestProjectionVersion: number;
}): TaskProjectionRecord {
  return {
    ...input.task,
    recoveryState: "healthy",
    recoveryReason: undefined,
    lastRecoveredAt: input.task.updatedAt,
    latestEventId: input.latestEventId,
    latestProjectionVersion: input.latestProjectionVersion
  };
}

export function isTaskDiffEvent(event: AuditEvent) {
  return event.eventType === "task.diff_recorded";
}

export function taskFromAuditEvent(event: AuditEvent) {
  if (isTaskDiffEvent(event)) {
    return undefined;
  }

  return TaskRecordSchema.parse(event.payloadJson);
}
