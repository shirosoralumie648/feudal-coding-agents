import { types } from "pg";
import { newDb } from "pg-mem";
import { describe, expect, it, vi } from "vitest";
import { createPostgresEventStore } from "./event-store";
import type { SqlPool } from "./postgres";
import { runMigrations } from "./migrations";

async function createStore() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  await runMigrations(pool);

  return {
    pool,
    store: createPostgresEventStore({ pool })
  };
}

describe("postgres event store", () => {
  it("parses int8 values as safe JavaScript numbers", () => {
    expect(types.getTypeParser(20)("42")).toBe(42);
    expect(() => types.getTypeParser(20)(String(BigInt(Number.MAX_SAFE_INTEGER) + 1n))).toThrow(
      "int8 value exceeds JavaScript safe integer range"
    );
  });

  it("creates base tables, appends versioned events, and tracks checkpoints", async () => {
    const { pool, store } = await createStore();
    const tableResult = await pool.query(`
      select table_name
        from information_schema.tables
       where table_schema = 'public'
         and table_name in (
           'event_log',
           'projection_checkpoint',
           'tasks_current',
           'task_history_entries',
           'runs_current',
           'artifacts_current',
           'operator_actions'
         )
       order by table_name asc
    `);

    await store.append({
      streamType: "task",
      streamId: "task-1",
      expectedVersion: 0,
      events: [
        {
          eventType: "task.created",
          payloadJson: { taskId: "task-1", title: "Build dashboard" },
          metadataJson: { actorType: "system" }
        }
      ]
    });
    await store.append({
      streamType: "task",
      streamId: "task-1",
      expectedVersion: 1,
      events: [
        {
          eventType: "task.diff_recorded",
          payloadJson: {
            targetType: "task",
            targetId: "task-1",
            beforeSubsetJson: {},
            afterSubsetJson: { status: "awaiting_approval" },
            patchJson: [{ op: "add", path: "/status", value: "awaiting_approval" }],
            changedPaths: ["/status"]
          },
          metadataJson: { actorType: "system" }
        }
      ]
    });

    const rows = await store.loadAfter(0);
    await store.writeCheckpoint("tasks_current", rows.at(-1)?.id ?? 0);

    expect(tableResult.rows.map((row) => row.table_name)).toEqual([
      "artifacts_current",
      "event_log",
      "operator_actions",
      "projection_checkpoint",
      "runs_current",
      "task_history_entries",
      "tasks_current"
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.eventType)).toEqual([
      "task.created",
      "task.diff_recorded"
    ]);
    expect(rows.map((row) => typeof row.id)).toEqual(["number", "number"]);
    expect(await store.readCheckpoint("tasks_current")).toBe(rows.at(-1)?.id);
  });

  it("throws a stable version mismatch error for stale writers", async () => {
    const { store } = await createStore();

    await store.append({
      streamType: "task",
      streamId: "task-1",
      expectedVersion: 0,
      events: [
        {
          eventType: "task.created",
          payloadJson: { taskId: "task-1", title: "Build dashboard" },
          metadataJson: { actorType: "system" }
        }
      ]
    });

    await expect(
      store.append({
        streamType: "task",
        streamId: "task-1",
        expectedVersion: 0,
        events: [
          {
            eventType: "task.status_transitioned",
            payloadJson: { taskId: "task-1", status: "planning" },
            metadataJson: { actorType: "system" }
          }
        ]
      })
    ).rejects.toThrow("Event version mismatch for task:task-1");
  });

  it("normalizes unique-key races to the same version mismatch error", async () => {
    const client = {
      query: vi.fn(async (statement: string) => {
        if (statement === "begin" || statement === "rollback") {
          return { rows: [] };
        }

        if (statement.includes("select coalesce(max(event_version), 0)")) {
          return { rows: [{ version: 0 }] };
        }

        if (statement.includes("insert into event_log")) {
          const error = new Error("duplicate key value violates unique constraint") as Error & {
            code: string;
          };
          error.code = "23505";
          throw error;
        }

        throw new Error(`Unexpected query: ${statement}`);
      }),
      release: vi.fn()
    };

    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn()
    } as unknown as SqlPool;

    const store = createPostgresEventStore({ pool });

    await expect(
      store.append({
        streamType: "task",
        streamId: "task-race",
        expectedVersion: 0,
        events: [
          {
            eventType: "task.created",
            payloadJson: { taskId: "task-race", title: "Build dashboard" },
            metadataJson: { actorType: "system" }
          }
        ]
      })
    ).rejects.toThrow("Event version mismatch for task:task-race");
  });

  it("rolls back the whole batch when a later insert fails", async () => {
    let insertCount = 0;

    const client = {
      query: vi.fn(async (statement: string) => {
        if (statement === "begin" || statement === "rollback") {
          return { rows: [] };
        }

        if (statement === "commit") {
          throw new Error("commit should not run after a failed append");
        }

        if (statement.includes("select coalesce(max(event_version), 0)")) {
          return { rows: [{ version: 0 }] };
        }

        if (statement.includes("insert into event_log")) {
          insertCount += 1;

          if (insertCount === 2) {
            throw new Error("simulated insert failure");
          }

          return {
            rows: [
              {
                id: insertCount,
                streamType: "task",
                streamId: "task-rollback",
                eventType: "task.created",
                eventVersion: insertCount
              }
            ]
          };
        }

        throw new Error(`Unexpected query: ${statement}`);
      }),
      release: vi.fn()
    };

    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn()
    } as unknown as SqlPool;

    const store = createPostgresEventStore({ pool });

    await expect(
      store.append({
        streamType: "task",
        streamId: "task-rollback",
        expectedVersion: 0,
        events: [
          {
            eventType: "task.created",
            payloadJson: { taskId: "task-rollback", title: "Build dashboard" },
            metadataJson: { actorType: "system" }
          },
          {
            eventType: "task.diff_recorded",
            payloadJson: undefined as unknown as Record<string, unknown>,
            metadataJson: { actorType: "system" }
          }
        ]
      })
    ).rejects.toThrow("simulated insert failure");

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith("begin");
    expect(client.query).toHaveBeenCalledWith("rollback");
    expect(insertCount).toBe(2);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("never moves checkpoints backwards", async () => {
    const { store } = await createStore();

    await store.writeCheckpoint("tasks_current", 9);
    await store.writeCheckpoint("tasks_current", 4);

    expect(await store.readCheckpoint("tasks_current")).toBe(9);
  });
});
