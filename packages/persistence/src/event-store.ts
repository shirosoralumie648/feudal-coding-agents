import "./postgres";
import type { PoolClient } from "pg";
import type { SqlPool } from "./postgres";

export interface AppendRequest {
  streamType: string;
  streamId: string;
  expectedVersion: number;
  events: {
    eventType: string;
    payloadJson: Record<string, unknown>;
    metadataJson: Record<string, unknown>;
  }[];
}

function toEventVersionMismatchError(streamType: string, streamId: string) {
  return new Error(`Event version mismatch for ${streamType}:${streamId}`);
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export function createPostgresEventStore(options: { pool: SqlPool }) {
  const { pool } = options;

  return {
    async withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
      const client = await pool.connect();

      try {
        await client.query("begin");
        const result = await work(client);
        await client.query("commit");
        return result;
      } catch (error) {
        try {
          await client.query("rollback");
        } catch {
          // Preserve the original failure when rollback also errors.
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async append(input: AppendRequest, executor?: PoolClient) {
      if (!executor) {
        return this.withTransaction((client) => this.append(input, client));
      }

      const versionResult = await executor.query(
        `select coalesce(max(event_version), 0) as version
           from event_log
          where stream_type = $1 and stream_id = $2`,
        [input.streamType, input.streamId]
      );

      const currentVersion = Number(versionResult.rows[0]?.version ?? 0);

      if (currentVersion !== input.expectedVersion) {
        throw toEventVersionMismatchError(input.streamType, input.streamId);
      }

      const appended = [];

      try {
        for (const [offset, event] of input.events.entries()) {
          const inserted = await executor.query(
            `insert into event_log (
               stream_type, stream_id, event_type, event_version,
               actor_id, actor_type, reason, correlation_id, causation_id,
               payload_json, metadata_json
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             returning id, stream_type as "streamType", stream_id as "streamId",
                       event_type as "eventType", event_version as "eventVersion"`,
            [
              input.streamType,
              input.streamId,
              event.eventType,
              input.expectedVersion + offset + 1,
              event.metadataJson.actorId ?? null,
              event.metadataJson.actorType ?? null,
              event.metadataJson.reason ?? null,
              event.metadataJson.correlationId ?? null,
              event.metadataJson.causationId ?? null,
              event.payloadJson,
              event.metadataJson
            ]
          );

          appended.push(inserted.rows[0]);
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw toEventVersionMismatchError(input.streamType, input.streamId);
        }

        throw error;
      }

      return appended;
    },

    async loadStream(streamType: string, streamId: string) {
      const result = await pool.query(
        `select id, stream_type as "streamType", stream_id as "streamId",
                event_type as "eventType", event_version as "eventVersion",
                occurred_at as "occurredAt", payload_json as "payloadJson",
                metadata_json as "metadataJson"
           from event_log
          where stream_type = $1 and stream_id = $2
          order by event_version asc`,
        [streamType, streamId]
      );

      return result.rows;
    },

    async loadAfter(eventId: number) {
      const result = await pool.query(
        `select id, stream_type as "streamType", stream_id as "streamId",
                event_type as "eventType", event_version as "eventVersion",
                occurred_at as "occurredAt", payload_json as "payloadJson",
                metadata_json as "metadataJson"
           from event_log
          where id > $1
          order by id asc`,
        [eventId]
      );

      return result.rows;
    },

    async readCheckpoint(projectionName: string) {
      const result = await pool.query(
        `select last_event_id as "lastEventId"
           from projection_checkpoint
          where projection_name = $1`,
        [projectionName]
      );

      return result.rows[0]?.lastEventId as number | undefined;
    },

    async writeCheckpoint(
      projectionName: string,
      lastEventId: number,
      executor?: PoolClient
    ) {
      const queryExecutor = executor ?? pool;

      await queryExecutor.query(
        `insert into projection_checkpoint (projection_name, last_event_id, updated_at)
         values ($1, $2, now())
         on conflict (projection_name)
         do update set
           last_event_id = greatest(projection_checkpoint.last_event_id, excluded.last_event_id),
           updated_at = now()`,
        [projectionName, lastEventId]
      );
    }
  };
}
