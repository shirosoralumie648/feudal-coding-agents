import { createPostgresEventStore } from "@feudal/persistence";
import type { GatewayRunProjectionRecord, GatewayRunRecord } from "../store";
import {
  buildRunEventInputs,
  toGatewayRunProjectionRecord
} from "./run-event-codec";

function toIsoString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function toRunRecord(payload: unknown): GatewayRunRecord {
  const run = payload as GatewayRunRecord;

  return {
    id: run.id,
    agent: run.agent,
    status: run.status,
    phase: run.phase,
    messages: run.messages ?? [],
    artifacts: run.artifacts ?? [],
    awaitPrompt: run.awaitPrompt,
    allowedActions: run.allowedActions
  };
}

function toProjectionRecord(row: {
  recovery_state: string;
  recovery_reason: string | null;
  last_recovered_at: unknown;
  latest_event_id: number;
  latest_projection_version: number;
  payload_json: unknown;
}) {
  return {
    ...toRunRecord(row.payload_json),
    recoveryState: row.recovery_state as GatewayRunProjectionRecord["recoveryState"],
    recoveryReason: row.recovery_reason ?? undefined,
    lastRecoveredAt: row.last_recovered_at ? toIsoString(row.last_recovered_at) : undefined,
    latestEventId: Number(row.latest_event_id),
    latestProjectionVersion: Number(row.latest_projection_version)
  } satisfies GatewayRunProjectionRecord;
}

async function upsertRunProjection(options: {
  queryable: { query: (sql: string, values: unknown[]) => Promise<unknown> };
  run: GatewayRunRecord;
  projection: GatewayRunProjectionRecord;
}) {
  await options.queryable.query(
    `insert into runs_current (
       id, task_id, agent, status, phase, recovery_state, recovery_reason,
       last_recovered_at, latest_event_id, latest_projection_version,
       payload_json, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (id) do update set
       agent = excluded.agent,
       status = excluded.status,
       phase = excluded.phase,
       recovery_state = excluded.recovery_state,
       recovery_reason = excluded.recovery_reason,
       last_recovered_at = excluded.last_recovered_at,
       latest_event_id = excluded.latest_event_id,
       latest_projection_version = excluded.latest_projection_version,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`,
    [
      options.run.id,
      null,
      options.run.agent,
      options.run.status,
      options.run.phase ?? null,
      options.projection.recoveryState,
      options.projection.recoveryReason ?? null,
      options.projection.lastRecoveredAt ?? new Date().toISOString(),
      options.projection.latestEventId,
      options.projection.latestProjectionVersion,
      toRunRecord(options.run),
      new Date().toISOString()
    ]
  );
}

export function createRunReadModel(options: {
  eventStore: ReturnType<typeof createPostgresEventStore>;
}) {
  return {
    async saveRun(run: GatewayRunRecord, eventType: string, expectedVersion: number) {
      return options.eventStore.withTransaction(async (tx) => {
        const previousResult = await tx.query(
          `select payload_json
             from runs_current
            where id = $1`,
          [run.id]
        );
        const previousRun = previousResult.rows[0]?.payload_json
          ? toRunRecord(previousResult.rows[0].payload_json)
          : undefined;
        const appended = await options.eventStore.append(
          {
            streamType: "run",
            streamId: run.id,
            expectedVersion,
            events: buildRunEventInputs(run, eventType, previousRun)
          },
          tx
        );

        const latestEvent = appended.at(-1);
        const projection = toGatewayRunProjectionRecord({
          run,
          latestEventId: latestEvent?.id ?? 0,
          latestProjectionVersion: latestEvent?.eventVersion ?? expectedVersion,
          lastRecoveredAt: new Date().toISOString()
        });

        await upsertRunProjection({
          queryable: tx,
          run,
          projection
        });
        await options.eventStore.writeCheckpoint("runs_current", latestEvent?.id ?? 0, tx);

        return projection;
      });
    },

    async getRun(runId: string) {
      const result = await options.eventStore.withTransaction(async (tx) =>
        tx.query(
          `select recovery_state, recovery_reason, last_recovered_at,
                  latest_event_id, latest_projection_version, payload_json
             from runs_current
            where id = $1`,
          [runId]
        )
      );

      const row = result.rows[0];
      return row ? toProjectionRecord(row) : undefined;
    },

    async rebuild() {
      const checkpoint = await options.eventStore.readCheckpoint("runs_current");

      if (checkpoint !== undefined) {
        return;
      }

      const events = (await options.eventStore.loadAfter(0)).filter(
        (event) => event.streamType === "run"
      );

      if (events.length === 0) {
        await options.eventStore.writeCheckpoint("runs_current", 0);
        return;
      }

      const latestRunById = new Map<string, GatewayRunRecord>();
      const latestStreamPositionByRun = new Map<
        string,
        { eventId: number; eventVersion: number }
      >();

      for (const event of events) {
        latestStreamPositionByRun.set(event.streamId, {
          eventId: event.id,
          eventVersion: event.eventVersion
        });

        if (event.eventType === "run.diff_recorded") {
          continue;
        }

        latestRunById.set(event.streamId, toRunRecord(event.payloadJson));
      }

      await options.eventStore.withTransaction(async (tx) => {
        for (const [runId, run] of latestRunById.entries()) {
          const latestStreamPosition = latestStreamPositionByRun.get(runId);

          if (!latestStreamPosition) {
            continue;
          }

          const projection = toGatewayRunProjectionRecord({
            run,
            latestEventId: latestStreamPosition.eventId,
            latestProjectionVersion: latestStreamPosition.eventVersion,
            lastRecoveredAt: new Date().toISOString()
          });

          await upsertRunProjection({
            queryable: tx,
            run,
            projection
          });
        }

        await options.eventStore.writeCheckpoint("runs_current", events.at(-1)?.id ?? 0, tx);
      });
    },

    async rebuildProjectionsIfNeeded() {
      await this.rebuild();
    }
  };
}
