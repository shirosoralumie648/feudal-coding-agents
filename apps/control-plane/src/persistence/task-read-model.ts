import {
  RecoveryStateSchema,
  TaskRecordSchema,
  type ACPRunSummary,
  type AuditEvent,
  type OperatorActionRecord,
  type RecoveryState,
  type TaskArtifact,
  type TaskRecord
} from "@feudal/contracts";
import { createPostgresEventStore } from "@feudal/persistence";
import { syncOperatorActions } from "../operator-actions/policy";
import {
  buildTaskEventInputs,
  isTaskDiffEvent,
  taskFromAuditEvent,
  toAuditEvent,
  toTaskProjectionRecord
} from "./task-event-codec";
import type { SaveTaskOptions } from "../store";

export interface TaskProjectionRecord extends TaskRecord {
  recoveryState: RecoveryState;
  recoveryReason?: string;
  lastRecoveredAt?: string;
  latestEventId: number;
  latestProjectionVersion: number;
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

function toProjectionRecord(row: {
  recovery_state: unknown;
  recovery_reason: string | null;
  last_recovered_at: unknown;
  latest_event_id: number;
  latest_projection_version: number;
  payload_json: unknown;
}) {
  const recoveryState = RecoveryStateSchema.parse(row.recovery_state);
  const task = syncOperatorActions(
    TaskRecordSchema.parse(row.payload_json),
    recoveryState
  );

  return {
    ...task,
    recoveryState,
    recoveryReason: row.recovery_reason ?? undefined,
    lastRecoveredAt: row.last_recovered_at ? toIsoString(row.last_recovered_at) : undefined,
    latestEventId: Number(row.latest_event_id),
    latestProjectionVersion: Number(row.latest_projection_version)
  } satisfies TaskProjectionRecord;
}

type ProjectionQueryable = {
  query: (
    sql: string,
    values: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

async function replaceTaskHistoryEntries(options: {
  queryable: { query: (sql: string, values: unknown[]) => Promise<unknown> };
  task: TaskRecord;
}) {
  await options.queryable.query(`delete from task_history_entries where task_id = $1`, [
    options.task.id
  ]);

  for (const [ordinal, entry] of options.task.history.entries()) {
    await options.queryable.query(
      `insert into task_history_entries (task_id, ordinal, status, at, note)
       values ($1,$2,$3,$4,$5)`,
      [options.task.id, ordinal, entry.status, entry.at, entry.note]
    );
  }
}

async function replaceTaskArtifacts(options: {
  queryable: { query: (sql: string, values: unknown[]) => Promise<unknown> };
  task: TaskRecord;
  latestEventId: number;
  latestProjectionVersion: number;
}) {
  const artifactIds = options.task.artifacts.map((artifact) => artifact.id);

  if (artifactIds.length === 0) {
    await options.queryable.query(`delete from artifacts_current where task_id = $1`, [
      options.task.id
    ]);
    return;
  }

  await options.queryable.query(
    `delete from artifacts_current
      where task_id = $1
        and not (id = any($2::text[]))`,
    [options.task.id, artifactIds]
  );

  for (const artifact of options.task.artifacts) {
    await options.queryable.query(
      `insert into artifacts_current (
         id, task_id, kind, name, mime_type, payload_json,
         latest_event_id, latest_projection_version
       ) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set
         task_id = excluded.task_id,
         kind = excluded.kind,
         name = excluded.name,
         mime_type = excluded.mime_type,
         payload_json = excluded.payload_json,
         latest_event_id = excluded.latest_event_id,
         latest_projection_version = excluded.latest_projection_version`,
      [
        artifact.id,
        options.task.id,
        artifact.kind,
        artifact.name,
        artifact.mimeType,
        artifact.content,
        options.latestEventId,
        options.latestProjectionVersion
      ]
    );
  }
}

async function appendOperatorAction(options: {
  queryable: { query: (sql: string, values: unknown[]) => Promise<unknown> };
  task: TaskRecord;
  eventType: string;
}) {
  const actionType =
    options.eventType === "task.approved"
      ? "approve"
      : options.eventType === "task.rejected"
        ? "reject"
        : options.eventType === "task.revision_submitted"
          ? "revise"
        : undefined;

  if (!actionType) {
    return;
  }

  await options.queryable.query(
    `insert into operator_actions (
       task_id, action_type, status, actor_id, actor_type, reason, payload_json, created_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [options.task.id, actionType, "applied", null, "user", null, {}, options.task.updatedAt]
  );
}

async function loadTaskHistory(queryable: ProjectionQueryable, taskId: string) {
  const result = await queryable.query(
    `select status, at, note
       from task_history_entries
      where task_id = $1
      order by ordinal asc`,
    [taskId]
  );

  return result.rows.map((row) => ({
    status: String(row.status) as TaskRecord["history"][number]["status"],
    at: toIsoString(row.at),
    note: String(row.note)
  }));
}

async function loadTaskArtifacts(queryable: ProjectionQueryable, taskId: string) {
  const result = await queryable.query(
    `select id, kind, name, mime_type, payload_json
       from artifacts_current
      where task_id = $1
      order by id asc`,
    [taskId]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind) as TaskArtifact["kind"],
    name: String(row.name),
    mimeType: String(row.mime_type),
    content: row.payload_json
  }));
}

async function loadTaskRuns(queryable: ProjectionQueryable, taskId: string) {
  const result = await queryable.query(
    `select payload_json
       from runs_current
      where task_id = $1
      order by updated_at asc`,
    [taskId]
  );

  return result.rows.map((row) => {
    const payload = row.payload_json as Record<string, unknown>;
    const agent = String(payload.agent);

    return {
      id: String(payload.id),
      agent,
      status: String(payload.status) as ACPRunSummary["status"],
      phase: toRunPhase(agent, payload.phase),
      awaitPrompt:
        typeof payload.awaitPrompt === "string" ? payload.awaitPrompt : undefined,
      allowedActions: Array.isArray(payload.allowedActions)
        ? payload.allowedActions.filter(
            (action): action is string => typeof action === "string"
          )
        : undefined
    } satisfies ACPRunSummary;
  });
}

async function loadOperatorActions(
  queryable: ProjectionQueryable,
  taskId: string
) {
  const result = await queryable.query(
    `select id, task_id, action_type, status, actor_id, actor_type, reason, payload_json, created_at
       from operator_actions
      where task_id = $1
      order by id asc`,
    [taskId]
  );

  return result.rows.map((row) => {
    const payload = (row.payload_json ?? {}) as Record<string, unknown>;

    return {
      id: Number(row.id),
      taskId: String(row.task_id),
      actionType: String(row.action_type) as OperatorActionRecord["actionType"],
      status: String(row.status) as OperatorActionRecord["status"],
      note: typeof payload.note === "string" ? payload.note : "",
      actorType: String(row.actor_type),
      actorId: typeof row.actor_id === "string" ? row.actor_id : undefined,
      createdAt: toIsoString(row.created_at),
      appliedAt: typeof payload.appliedAt === "string" ? payload.appliedAt : undefined,
      rejectedAt: typeof payload.rejectedAt === "string" ? payload.rejectedAt : undefined,
      rejectionReason: typeof row.reason === "string" ? row.reason : undefined
    } satisfies OperatorActionRecord;
  });
}

async function hydrateTaskProjection(
  queryable: ProjectionQueryable,
  task: TaskProjectionRecord
) {
  const [history, artifacts, runs] = await Promise.all([
    loadTaskHistory(queryable, task.id),
    loadTaskArtifacts(queryable, task.id),
    loadTaskRuns(queryable, task.id)
  ]);

  return {
    ...task,
    history,
    artifacts,
    runs,
    runIds: runs.map((run) => run.id)
  } satisfies TaskProjectionRecord;
}

function toRunPhase(agent: string, phase: unknown): ACPRunSummary["phase"] {
  if (typeof phase === "string") {
    return phase as ACPRunSummary["phase"];
  }

  if (agent === "intake-agent") {
    return "intake";
  }

  if (agent === "analyst-agent") {
    return "planning";
  }

  if (agent === "auditor-agent" || agent === "critic-agent") {
    return "review";
  }

  if (agent === "approval-gate") {
    return "approval";
  }

  if (agent === "gongbu-executor") {
    return "execution";
  }

  return "verification";
}

function toRecoveredTaskState(status: TaskRecord["status"]) {
  if (
    status === "awaiting_approval" ||
    status === "needs_revision" ||
    status === "completed" ||
    status === "partial_success" ||
    status === "rejected" ||
    status === "failed" ||
    status === "rolled_back" ||
    status === "abandoned"
  ) {
    return {
      recoveryState: "healthy" as const,
      recoveryReason: undefined
    };
  }

  return {
    recoveryState: "recovery_required" as const,
    recoveryReason: `Recovered ${status} task requires operator review`
  };
}

async function upsertTaskProjection(options: {
  queryable: { query: (sql: string, values: unknown[]) => Promise<unknown> };
  task: TaskRecord;
  recoveryState: RecoveryState;
  recoveryReason?: string;
  lastRecoveredAt: string;
  latestEventId: number;
  latestProjectionVersion: number;
}) {
  await options.queryable.query(
    `insert into tasks_current (
       id, title, prompt, status, recovery_state, recovery_reason,
       last_recovered_at, latest_event_id, latest_projection_version,
       payload_json, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (id) do update set
       title = excluded.title,
       prompt = excluded.prompt,
       status = excluded.status,
       recovery_state = excluded.recovery_state,
       recovery_reason = excluded.recovery_reason,
       last_recovered_at = excluded.last_recovered_at,
       latest_event_id = excluded.latest_event_id,
       latest_projection_version = excluded.latest_projection_version,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [
      options.task.id,
      options.task.title,
      options.task.prompt,
      options.task.status,
      options.recoveryState,
      options.recoveryReason ?? null,
      options.lastRecoveredAt,
      options.latestEventId,
      options.latestProjectionVersion,
      options.task as unknown as Record<string, unknown>,
      options.task.createdAt,
      options.task.updatedAt
    ]
  );
}

export function createTaskReadModel(options: {
  eventStore: ReturnType<typeof createPostgresEventStore>;
}) {
  return {
    async listTasks() {
      const result = await options.eventStore.withTransaction(async (tx) =>
        tx.query(
          `select recovery_state, recovery_reason, last_recovered_at,
                  latest_event_id, latest_projection_version, payload_json
             from tasks_current
            order by updated_at desc`
        )
      );

      return result.rows.map((row) => toProjectionRecord(row));
    },

    async getTask(taskId: string) {
      return options.eventStore.withTransaction(async (tx) => {
        const result = await tx.query(
          `select recovery_state, recovery_reason, last_recovered_at,
                  latest_event_id, latest_projection_version, payload_json
             from tasks_current
            where id = $1`,
          [taskId]
        );
        const row = result.rows[0];

        return row ? hydrateTaskProjection(tx as ProjectionQueryable, toProjectionRecord(row)) : undefined;
      });
    },

    async saveTask(
      task: TaskRecord,
      eventType: string,
      expectedVersion: number,
      saveOptions: SaveTaskOptions = {}
    ) {
      return options.eventStore.withTransaction(async (tx) => {
        const recoveryState = saveOptions.recoveryState ?? "healthy";
        const syncedTask = syncOperatorActions(task, recoveryState);
        const previousResult = await tx.query(
          `select payload_json
             from tasks_current
            where id = $1`,
          [syncedTask.id]
        );
        const previousTask = previousResult.rows[0]?.payload_json
          ? TaskRecordSchema.parse(previousResult.rows[0].payload_json)
          : undefined;
        const appended = await options.eventStore.append(
          {
            streamType: "task",
            streamId: syncedTask.id,
            expectedVersion,
            events: buildTaskEventInputs(syncedTask, eventType, previousTask)
          },
          tx
        );

        const latestEvent = appended.at(-1);
        await upsertTaskProjection({
          queryable: tx,
          task: syncedTask,
          recoveryState,
          recoveryReason: saveOptions.recoveryReason,
          lastRecoveredAt: saveOptions.lastRecoveredAt ?? new Date().toISOString(),
          latestEventId: latestEvent?.id ?? 0,
          latestProjectionVersion: latestEvent?.eventVersion ?? expectedVersion
        });
        await replaceTaskHistoryEntries({
          queryable: tx,
          task: syncedTask
        });
        await replaceTaskArtifacts({
          queryable: tx,
          task: syncedTask,
          latestEventId: latestEvent?.id ?? 0,
          latestProjectionVersion: latestEvent?.eventVersion ?? expectedVersion
        });
        if (saveOptions.operatorAction) {
          await tx.query(
            `insert into operator_actions (
               task_id, action_type, status, actor_id, actor_type, reason, payload_json, created_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              syncedTask.id,
              saveOptions.operatorAction.actionType,
              saveOptions.operatorAction.status,
              saveOptions.operatorAction.actorId ?? null,
              saveOptions.operatorAction.actorType,
              saveOptions.operatorAction.rejectionReason ?? null,
              {
                note: saveOptions.operatorAction.note,
                appliedAt: saveOptions.operatorAction.appliedAt ?? null,
                rejectedAt: saveOptions.operatorAction.rejectedAt ?? null
              },
              saveOptions.operatorAction.createdAt
            ]
          );
        }
        await options.eventStore.writeCheckpoint("tasks_current", latestEvent?.id ?? 0, tx);

        return toTaskProjectionRecord({
          task: syncedTask,
          recoveryState,
          recoveryReason: saveOptions.recoveryReason,
          lastRecoveredAt: saveOptions.lastRecoveredAt ?? syncedTask.updatedAt,
          latestEventId: latestEvent?.id ?? 0,
          latestProjectionVersion: latestEvent?.eventVersion ?? expectedVersion
        });
      });
    },

    async listTaskEvents(taskId: string) {
      const task = await this.getTask(taskId);

      if (!task) {
        return undefined;
      }

      const events = await options.eventStore.loadStream("task", taskId);
      return events.map((event) => toAuditEvent(event));
    },

    async listTaskDiffs(taskId: string) {
      const events = await this.listTaskEvents(taskId);
      return events?.filter((event) => isTaskDiffEvent(event));
    },

    async listTaskRuns(taskId: string) {
      return options.eventStore.withTransaction(async (tx) => {
        const result = await tx.query(`select id from tasks_current where id = $1`, [taskId]);

        if (!result.rows[0]) {
          return undefined;
        }

        return loadTaskRuns(tx as ProjectionQueryable, taskId);
      });
    },

    async listTaskArtifacts(taskId: string) {
      return options.eventStore.withTransaction(async (tx) => {
        const result = await tx.query(`select id from tasks_current where id = $1`, [taskId]);

        if (!result.rows[0]) {
          return undefined;
        }

        return loadTaskArtifacts(tx as ProjectionQueryable, taskId);
      });
    },

    async listOperatorActions(taskId: string) {
      return options.eventStore.withTransaction(async (tx) => {
        const result = await tx.query(`select id from tasks_current where id = $1`, [taskId]);

        if (!result.rows[0]) {
          return undefined;
        }

        return loadOperatorActions(tx as ProjectionQueryable, taskId);
      });
    },

    async getOperatorActionSummary() {
      const tasks = (await this.listTasks())
        .filter((task) => task.operatorAllowedActions.length > 0)
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          recoveryState: task.recoveryState,
          recoveryReason: task.recoveryReason,
          operatorAllowedActions: task.operatorAllowedActions
        }));

      return {
        tasksNeedingOperatorAttention: tasks.length,
        tasks
      };
    },

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
    },

    async getRecoverySummary() {
      const [tasksResult, runsResult] = await Promise.all([
        options.eventStore.withTransaction(async (tx) =>
          tx.query(
            `select count(*) as count
               from tasks_current
              where recovery_state <> 'healthy'`
          )
        ),
        options.eventStore.withTransaction(async (tx) =>
          tx.query(
            `select count(*) as count
               from runs_current
              where recovery_state <> 'healthy'`
          )
        )
      ]);

      return {
        tasksNeedingRecovery: Number(tasksResult.rows[0]?.count ?? 0),
        runsNeedingRecovery: Number(runsResult.rows[0]?.count ?? 0)
      };
    },

    async rebuildProjectionsIfNeeded() {
      const checkpoint = await options.eventStore.readCheckpoint("tasks_current");

      if (checkpoint !== undefined) {
        return;
      }

      const events = (await options.eventStore.loadAfter(0))
        .map((event) => toAuditEvent(event))
        .filter((event) => event.streamType === "task");

      if (events.length === 0) {
        await options.eventStore.writeCheckpoint("tasks_current", 0);
        return;
      }

      const latestSnapshotByTask = new Map<string, TaskRecord>();
      const latestStreamPositionByTask = new Map<
        string,
        { eventId: number; eventVersion: number }
      >();

      for (const event of events) {
        latestStreamPositionByTask.set(event.streamId, {
          eventId: event.id,
          eventVersion: event.eventVersion
        });

        const task = taskFromAuditEvent(event);

        if (!task) {
          continue;
        }

        latestSnapshotByTask.set(event.streamId, task);
      }

      await options.eventStore.withTransaction(async (tx) => {
        for (const [taskId, task] of latestSnapshotByTask.entries()) {
          const latestStreamPosition = latestStreamPositionByTask.get(taskId);

          if (!latestStreamPosition) {
            continue;
          }

          const recovered = toRecoveredTaskState(task.status);
          const rebuiltTask = syncOperatorActions(task, recovered.recoveryState);

          await upsertTaskProjection({
            queryable: tx,
            task: rebuiltTask,
            recoveryState: recovered.recoveryState,
            recoveryReason: recovered.recoveryReason,
            lastRecoveredAt: task.updatedAt,
            latestEventId: latestStreamPosition.eventId,
            latestProjectionVersion: latestStreamPosition.eventVersion
          });
          await replaceTaskHistoryEntries({
            queryable: tx,
            task: rebuiltTask
          });
          await replaceTaskArtifacts({
            queryable: tx,
            task: rebuiltTask,
            latestEventId: latestStreamPosition.eventId,
            latestProjectionVersion: latestStreamPosition.eventVersion
          });
        }

        await options.eventStore.writeCheckpoint("tasks_current", events.at(-1)?.id ?? 0, tx);
      });
    }
  };
}
