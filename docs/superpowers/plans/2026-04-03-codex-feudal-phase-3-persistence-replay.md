# Phase 3-1 Persistence And Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Postgres-backed event persistence, immutable audit history, replay APIs, and a read-only replay UI for the existing ACP-driven task workflow.

**Architecture:** Persist authoritative task and run changes as append-only events in Postgres, then project those events into query tables for fast API and UI reads. Keep `control-plane` authoritative for task truth, let `acp-gateway` own run truth, and add replay endpoints that rebuild point-in-time task views from the event log on demand.

**Tech Stack:** TypeScript, Fastify, React 19, Vitest, Postgres via `pg`, in-memory Postgres tests via `pg-mem`

---

## File Map

### Shared Persistence Package
- Create: `packages/persistence/package.json`
- Create: `packages/persistence/src/index.ts`
- Create: `packages/persistence/src/postgres.ts`
- Create: `packages/persistence/src/migrations.ts`
- Create: `packages/persistence/src/event-store.ts`
- Create: `packages/persistence/src/event-store.test.ts`

### Shared Contracts
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

### Control Plane
- Modify: `apps/control-plane/package.json`
- Modify: `apps/control-plane/src/config.ts`
- Modify: `apps/control-plane/src/store.ts`
- Modify: `apps/control-plane/src/server.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
- Create: `apps/control-plane/src/persistence/task-event-codec.ts`
- Create: `apps/control-plane/src/persistence/task-read-model.ts`
- Create: `apps/control-plane/src/routes/replay.ts`
- Create: `apps/control-plane/src/routes/replay.test.ts`

### ACP Gateway
- Modify: `apps/acp-gateway/package.json`
- Modify: `apps/acp-gateway/src/store.ts`
- Modify: `apps/acp-gateway/src/server.ts`
- Modify: `apps/acp-gateway/src/routes/runs.ts`
- Modify: `apps/acp-gateway/src/routes/runs.test.ts`
- Modify: `apps/acp-gateway/src/smoke.test.ts`
- Create: `apps/acp-gateway/src/persistence/run-event-codec.ts`
- Create: `apps/acp-gateway/src/persistence/run-read-model.ts`
- Create: `apps/acp-gateway/src/persistence/run-read-model.test.ts`

### Web Console
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/src/components/timeline-panel.tsx`
- Create: `apps/web/src/components/diff-inspector-panel.tsx`

### Workspace
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vitest.config.ts`

## Task 1: Add The Shared Postgres Event Store

**Files:**
- Create: `packages/persistence/package.json`
- Create: `packages/persistence/src/index.ts`
- Create: `packages/persistence/src/postgres.ts`
- Create: `packages/persistence/src/migrations.ts`
- Create: `packages/persistence/src/event-store.ts`
- Create: `packages/persistence/src/event-store.test.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing event-store test**

```ts
import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { createPostgresEventStore } from "./event-store";
import { runMigrations } from "./migrations";

describe("postgres event store", () => {
  it("creates base tables, appends versioned events, and tracks checkpoints", async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);

    const store = createPostgresEventStore({ pool });
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
    expect(await store.readCheckpoint("tasks_current")).toBe(rows.at(-1)?.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/persistence/src/event-store.test.ts`

Expected: FAIL with `Cannot find module './event-store'` or `Cannot find module './migrations'`

- [ ] **Step 3: Add the package, migration runner, and event store**

```json
{
  "name": "@feudal/persistence",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "migrate": "tsx src/migrations.ts"
  },
  "dependencies": {
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "pg-mem": "^3.0.5",
    "tsx": "^4.20.0"
  }
}
```

```ts
export * from "./postgres";
export * from "./migrations";
export * from "./event-store";
```

```ts
import { Pool, type Pool as PgPool } from "pg";

export function createPostgresPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({ connectionString, max: 5 });
}

export type SqlPool = PgPool;
```

```ts
import { createPostgresPool, type SqlPool } from "./postgres";

const migrations = [
  `create table if not exists event_log (
     id bigserial primary key,
     stream_type text not null,
     stream_id text not null,
     event_type text not null,
     event_version integer not null,
     occurred_at timestamptz not null default now(),
     actor_id text,
     actor_type text,
     reason text,
     correlation_id text,
     causation_id text,
     payload_json jsonb not null,
     metadata_json jsonb not null default '{}'::jsonb,
     unique (stream_type, stream_id, event_version)
   )`,
  `create table if not exists projection_checkpoint (
     projection_name text primary key,
     last_event_id bigint not null,
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists tasks_current (
     id text primary key,
     title text not null,
     prompt text not null,
     status text not null,
     recovery_state text not null,
     recovery_reason text,
     last_recovered_at timestamptz,
     latest_event_id bigint not null,
     latest_projection_version integer not null,
     payload_json jsonb not null,
     created_at timestamptz not null,
     updated_at timestamptz not null
   )`,
  `create table if not exists task_history_entries (
     task_id text not null,
     ordinal integer not null,
     status text not null,
     at timestamptz not null,
     note text not null,
     primary key (task_id, ordinal)
   )`,
  `create table if not exists runs_current (
     id text primary key,
     task_id text,
     agent text not null,
     status text not null,
     phase text,
     recovery_state text not null,
     recovery_reason text,
     last_recovered_at timestamptz,
     latest_event_id bigint not null,
     latest_projection_version integer not null,
     payload_json jsonb not null,
     updated_at timestamptz not null
   )`,
  `create table if not exists artifacts_current (
     id text primary key,
     task_id text not null,
     kind text not null,
     name text not null,
     mime_type text not null,
     payload_json jsonb not null,
     latest_event_id bigint not null,
     latest_projection_version integer not null
   )`,
  `create table if not exists operator_actions (
     id bigserial primary key,
     task_id text,
     action_type text not null,
     status text not null,
     actor_id text,
     actor_type text,
     reason text,
     payload_json jsonb not null default '{}'::jsonb,
     created_at timestamptz not null default now()
   )`
];

export async function runMigrations(pool: SqlPool) {
  for (const sql of migrations) {
    await pool.query(sql);
  }
}

if (process.argv[1]?.endsWith("migrations.ts")) {
  const pool = createPostgresPool();
  runMigrations(pool).finally(() => pool.end());
}
```

```ts
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

type SqlExecutor = SqlPool | PoolClient;

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
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },

    async append(input: AppendRequest, executor: SqlExecutor = pool) {
      const versionResult = await executor.query(
          `select coalesce(max(event_version), 0) as version
             from event_log
            where stream_type = $1 and stream_id = $2`,
          [input.streamType, input.streamId]
      );

      const currentVersion = Number(versionResult.rows[0]?.version ?? 0);

      if (currentVersion !== input.expectedVersion) {
        throw new Error(`Event version mismatch for ${input.streamType}:${input.streamId}`);
      }

      const appended = [];

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
      executor: SqlExecutor = pool
    ) {
      await executor.query(
        `insert into projection_checkpoint (projection_name, last_event_id, updated_at)
         values ($1, $2, now())
         on conflict (projection_name)
         do update set last_event_id = excluded.last_event_id, updated_at = now()`,
        [projectionName, lastEventId]
      );
    }
  };
}
```

- [ ] **Step 4: Add workspace wiring and rerun the test**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contracts",
      "packages/orchestrator",
      "packages/acp",
      "packages/persistence",
      "apps/acp-gateway",
      "apps/control-plane",
      "apps/web"
    ]
  }
});
```

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter @feudal/acp-gateway --filter @feudal/control-plane --filter @feudal/web dev",
    "build": "pnpm --filter @feudal/web build",
    "test": "pnpm exec vitest run --config vitest.config.ts",
    "db:migrate": "pnpm --filter @feudal/persistence migrate"
  }
}
```

Run: `pnpm install && pnpm exec vitest run packages/persistence/src/event-store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the shared persistence package**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts packages/persistence/package.json packages/persistence/src/index.ts packages/persistence/src/postgres.ts packages/persistence/src/migrations.ts packages/persistence/src/event-store.ts packages/persistence/src/event-store.test.ts
git commit -m "Add Postgres event store package"
```

## Task 2: Eventize The Control-Plane Task Store

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/control-plane/package.json`
- Modify: `apps/control-plane/src/config.ts`
- Modify: `apps/control-plane/src/store.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
- Modify: `apps/control-plane/src/server.ts`
- Create: `apps/control-plane/src/persistence/task-event-codec.ts`
- Create: `apps/control-plane/src/persistence/task-read-model.ts`

- [ ] **Step 1: Add the failing task-route test for replay metadata**

```ts
it("returns recovery and event metadata on task creation", async () => {
  const app = createAppWithClient(createMockACPClient());

  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    }
  });

  expect(response.statusCode).toBe(201);
  expect(response.json().recoveryState).toBe("healthy");
  expect(response.json().latestEventId).toBeGreaterThan(0);
  expect(response.json().latestProjectionVersion).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the control-plane route tests to verify the failure**

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts`

Expected: FAIL with `expected undefined to be "healthy"` or `expected undefined to be greater than 0`

- [ ] **Step 3: Add task event codecs, projection writes, and response fields**

```ts
export const AuditEventSchema = z.object({
  id: z.number(),
  streamType: z.string(),
  streamId: z.string(),
  eventType: z.string(),
  eventVersion: z.number(),
  occurredAt: z.string(),
  payloadJson: z.record(z.string(), z.unknown()),
  metadataJson: z.record(z.string(), z.unknown())
});

export const RecoveryStateSchema = z.enum([
  "healthy",
  "replaying",
  "recovery_required"
]);

export type AuditEvent = z.infer<typeof AuditEventSchema>;
```

```ts
import { createPostgresEventStore } from "@feudal/persistence";

export interface TaskProjectionRecord extends TaskRecord {
  recoveryState: "healthy" | "replaying" | "recovery_required";
  recoveryReason?: string;
  lastRecoveredAt?: string;
  latestEventId: number;
  latestProjectionVersion: number;
}

export function createTaskReadModel(options: {
  eventStore: ReturnType<typeof createPostgresEventStore>;
}) {
  return {
    async saveTask(task: TaskRecord, eventType: string, expectedVersion: number) {
      return options.eventStore.withTransaction(async (tx) => {
        const appended = await options.eventStore.append(
          {
            streamType: "task",
            streamId: task.id,
            expectedVersion,
            events: [
              {
                eventType,
                payloadJson: task,
                metadataJson: { actorType: "control-plane" }
              },
              {
                eventType: "task.diff_recorded",
                payloadJson: {
                  targetType: "task",
                  targetId: task.id,
                  beforeSubsetJson: {},
                  afterSubsetJson: {
                    status: task.status,
                    approvalRequest: task.approvalRequest,
                    runs: task.runs
                  },
                  patchJson: [
                    { op: "replace", path: "/status", value: task.status }
                  ],
                  changedPaths: ["/status", "/approvalRequest", "/runs"]
                },
                metadataJson: { actorType: "control-plane" }
              }
            ]
          },
          tx
        );

        const latestEvent = appended.at(-1);
        await tx.query(
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
            task.id,
            task.title,
            task.prompt,
            task.status,
            "healthy",
            null,
            new Date().toISOString(),
            latestEvent?.id ?? 0,
            latestEvent?.eventVersion ?? expectedVersion,
            task,
            task.createdAt,
            task.updatedAt
          ]
        );
        await options.eventStore.writeCheckpoint("tasks_current", latestEvent?.id ?? 0, tx);

        return {
          ...task,
          recoveryState: "healthy",
          recoveryReason: undefined,
          lastRecoveredAt: task.updatedAt,
          latestEventId: latestEvent?.id ?? 0,
          latestProjectionVersion: latestEvent?.eventVersion ?? expectedVersion
        } satisfies TaskProjectionRecord;
      });
    }
  };
}
```

```ts
export interface TaskStore {
  listTasks(): Promise<TaskProjectionRecord[]>;
  getTask(taskId: string): Promise<TaskProjectionRecord | undefined>;
  saveTask(task: TaskRecord, eventType: string, expectedVersion: number): Promise<TaskProjectionRecord>;
  listTaskEvents(taskId: string): Promise<AuditEvent[]>;
  listTaskDiffs(taskId: string): Promise<AuditEvent[]>;
  listTaskRuns(taskId: string): Promise<ACPRunSummary[]>;
  listTaskArtifacts(taskId: string): Promise<TaskArtifact[]>;
  replayTaskAtEventId(taskId: string, eventId: number): Promise<{ task: TaskProjectionRecord } | undefined>;
  getRecoverySummary(): Promise<{ tasksNeedingRecovery: number; runsNeedingRecovery: number }>;
  rebuildProjectionsIfNeeded(): Promise<void>;
}
```

```ts
return reply.code(201).send({
  ...task,
  recoveryState: "healthy",
  recoveryReason: undefined,
  lastRecoveredAt: task.updatedAt,
  latestEventId: projection.latestEventId,
  latestProjectionVersion: projection.latestProjectionVersion
});
```

- [ ] **Step 4: Wire the Postgres-backed store through config and rerun the tests**

```ts
import { createPostgresPool, runMigrations, createPostgresEventStore } from "@feudal/persistence";

export async function createTaskStoreFromEnv() {
  const pool = createPostgresPool();
  await runMigrations(pool);
  const eventStore = createPostgresEventStore({ pool });
  return createTaskReadModel({ eventStore });
}
```

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts packages/contracts/src/index.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the control-plane task persistence work**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts apps/control-plane/package.json apps/control-plane/src/config.ts apps/control-plane/src/store.ts apps/control-plane/src/services/orchestrator-service.ts apps/control-plane/src/routes/tasks.ts apps/control-plane/src/routes/tasks.test.ts apps/control-plane/src/server.ts apps/control-plane/src/persistence/task-event-codec.ts apps/control-plane/src/persistence/task-read-model.ts
git commit -m "Persist control-plane task events"
```

## Task 3: Persist ACP Run Events In The Gateway

**Files:**
- Modify: `apps/acp-gateway/package.json`
- Modify: `apps/acp-gateway/src/store.ts`
- Modify: `apps/acp-gateway/src/routes/runs.ts`
- Modify: `apps/acp-gateway/src/routes/runs.test.ts`
- Modify: `apps/acp-gateway/src/server.ts`
- Create: `apps/acp-gateway/src/persistence/run-event-codec.ts`
- Create: `apps/acp-gateway/src/persistence/run-read-model.ts`
- Create: `apps/acp-gateway/src/persistence/run-read-model.test.ts`

- [ ] **Step 1: Write the failing run recovery projection test**

```ts
import { describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import { createPostgresEventStore, runMigrations } from "@feudal/persistence";
import { createRunReadModel } from "./run-read-model";

describe("run read model", () => {
  it("marks in-flight execution runs as recovery_required after rebuild", async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    const eventStore = createPostgresEventStore({ pool });
    const readModel = createRunReadModel({ eventStore });

    await eventStore.append({
      streamType: "run",
      streamId: "run-1",
      expectedVersion: 0,
      events: [
        {
          eventType: "run.created",
          payloadJson: { id: "run-1", status: "created", phase: "execution" },
          metadataJson: { actorType: "system" }
        },
        {
          eventType: "run.status_transitioned",
          payloadJson: { id: "run-1", status: "in-progress", phase: "execution" },
          metadataJson: { actorType: "system" }
        }
      ]
    });

    await readModel.rebuild();
    const run = await readModel.getRun("run-1");

    expect(run?.recoveryState).toBe("recovery_required");
    expect(run?.recoveryReason).toContain("in-progress");
  });
});
```

- [ ] **Step 2: Run the gateway recovery test to verify it fails**

Run: `pnpm exec vitest run apps/acp-gateway/src/persistence/run-read-model.test.ts`

Expected: FAIL with `Cannot find module './run-read-model'`

- [ ] **Step 3: Add the run projection and wire route writes through it**

```ts
export function createRunReadModel(options: {
  eventStore: ReturnType<typeof createPostgresEventStore>;
}) {
  return {
    async recordRun(run: GatewayRunRecord, eventType: string, expectedVersion: number) {
      return options.eventStore.withTransaction(async (tx) => {
        const appended = await options.eventStore.append(
          {
            streamType: "run",
            streamId: run.id,
            expectedVersion,
            events: [
              {
                eventType,
                payloadJson: run,
                metadataJson: { actorType: "acp-gateway" }
              },
              {
                eventType: "run.diff_recorded",
                payloadJson: {
                  targetType: "run",
                  targetId: run.id,
                  beforeSubsetJson: {},
                  afterSubsetJson: {
                    status: run.status,
                    awaitPrompt: run.awaitPrompt,
                    allowedActions: run.allowedActions
                  },
                  patchJson: [{ op: "replace", path: "/status", value: run.status }],
                  changedPaths: ["/status", "/awaitPrompt", "/allowedActions"]
                },
                metadataJson: { actorType: "acp-gateway" }
              }
            ]
          },
          tx
        );

        const latestEvent = appended.at(-1);
        const recoveryState =
          run.status === "completed" || run.status === "failed"
            ? "healthy"
            : run.status === "awaiting"
              ? "healthy"
              : "recovery_required";

        await tx.query(
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
            run.id,
            null,
            run.agent,
            run.status,
            null,
            recoveryState,
            recoveryState === "recovery_required"
              ? `Recovered ${run.status} run requires operator review`
              : null,
            new Date().toISOString(),
            latestEvent?.id ?? 0,
            latestEvent?.eventVersion ?? expectedVersion,
            run,
            new Date().toISOString()
          ]
        );
        await options.eventStore.writeCheckpoint("runs_current", latestEvent?.id ?? 0, tx);
      });
    },

    async rebuild() {
      const checkpoint = (await options.eventStore.readCheckpoint("runs_current")) ?? 0;
      const events = await options.eventStore.loadAfter(checkpoint);

      for (const event of events.filter((row) => row.streamType === "run")) {
        if (event.eventType === "run.created" || event.eventType === "run.status_transitioned") {
          await this.recordRun(event.payloadJson as GatewayRunRecord, event.eventType, event.eventVersion - 1);
        }
      }
    },

    async getRun(runId: string) {
      const rows = await options.eventStore.loadStream("run", runId);
      const latest = rows.at(-1)?.payloadJson as GatewayRunRecord | undefined;

      return latest
        ? {
            ...latest,
            recoveryState:
              latest.status === "completed" || latest.status === "failed"
                ? "healthy"
                : latest.status === "awaiting"
                  ? "healthy"
                  : "recovery_required",
            recoveryReason:
              latest.status === "completed" || latest.status === "failed" || latest.status === "awaiting"
                ? undefined
                : `Recovered ${latest.status} run requires operator review`
          }
        : undefined;
    }
  };
}
```

```ts
const persisted = await runStore.recordAwaitingRun({
  id: randomUUID(),
  agent: payload.label,
  status: "awaiting",
  messages: [],
  artifacts: [],
  awaitPrompt: payload.prompt,
  allowedActions: payload.actions
});

return reply.code(201).send({
  ...persisted,
  recoveryState: "healthy",
  recoveryReason: undefined
});
```

```ts
const resumed = await runStore.resumeAwaitingRun(params.runId, response);
return {
  ...resumed,
  recoveryState: "healthy",
  recoveryReason: undefined
};
```

- [ ] **Step 4: Run the gateway tests for route persistence and rebuild behavior**

Run: `pnpm exec vitest run apps/acp-gateway/src/persistence/run-read-model.test.ts apps/acp-gateway/src/routes/runs.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the gateway run persistence changes**

```bash
git add apps/acp-gateway/package.json apps/acp-gateway/src/store.ts apps/acp-gateway/src/routes/runs.ts apps/acp-gateway/src/routes/runs.test.ts apps/acp-gateway/src/server.ts apps/acp-gateway/src/persistence/run-event-codec.ts apps/acp-gateway/src/persistence/run-read-model.ts apps/acp-gateway/src/persistence/run-read-model.test.ts
git commit -m "Persist ACP gateway run events"
```

## Task 4: Add Replay And Recovery APIs

**Files:**
- Create: `apps/control-plane/src/routes/replay.ts`
- Create: `apps/control-plane/src/routes/replay.test.ts`
- Modify: `apps/control-plane/src/store.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/server.ts`

- [ ] **Step 1: Write the failing replay-route test**

```ts
it("returns events, diffs, replay snapshots, and recovery summary", async () => {
  const app = await createReplayApp();
  const created = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    }
  });

  const taskId = created.json().id;
  const events = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/events` });
  const diffs = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/diffs` });
  const runs = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/runs` });
  const artifacts = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/artifacts` });
  const replay = await app.inject({
    method: "GET",
    url: `/api/tasks/${taskId}/replay?asOfEventId=${created.json().latestEventId}`
  });
  const recovery = await app.inject({ method: "GET", url: "/api/recovery/summary" });

  expect(events.statusCode).toBe(200);
  expect(events.json().length).toBeGreaterThan(0);
  expect(diffs.json().length).toBeGreaterThan(0);
  expect(runs.json().length).toBeGreaterThan(0);
  expect(artifacts.json().length).toBeGreaterThan(0);
  expect(replay.json().task.id).toBe(taskId);
  expect(recovery.json().tasksNeedingRecovery).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run the replay-route test to verify it fails**

Run: `pnpm exec vitest run apps/control-plane/src/routes/replay.test.ts`

Expected: FAIL with `Cannot find module './replay'` or `404`

- [ ] **Step 3: Add replay service methods and the new Fastify routes**

```ts
app.get("/api/tasks/:taskId/events", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  const events = await service.listTaskEvents(params.taskId);

  if (!events) {
    return reply.code(404).send({ message: "Task not found" });
  }

  return events;
});

app.get("/api/tasks/:taskId/replay", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  const query = z.object({ asOfEventId: z.coerce.number().int().positive() }).parse(request.query);
  const snapshot = await service.replayTaskAtEventId(params.taskId, query.asOfEventId);

  if (!snapshot) {
    return reply.code(404).send({ message: "Replay snapshot not found" });
  }

  return snapshot;
});

app.get("/api/tasks/:taskId/runs", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  return service.listTaskRuns(params.taskId);
});

app.get("/api/tasks/:taskId/artifacts", async (request, reply) => {
  const params = z.object({ taskId: z.string() }).parse(request.params);
  return service.listTaskArtifacts(params.taskId);
});

app.get("/api/recovery/summary", async () => service.getRecoverySummary());
```

```ts
return {
  listTaskEvents: (taskId: string) => store.listTaskEvents(taskId),
  listTaskDiffs: (taskId: string) => store.listTaskDiffs(taskId),
  listTaskRuns: (taskId: string) => store.listTaskRuns(taskId),
  listTaskArtifacts: (taskId: string) => store.listTaskArtifacts(taskId),
  replayTaskAtEventId: (taskId: string, eventId: number) =>
    store.replayTaskAtEventId(taskId, eventId),
  getRecoverySummary: () => store.getRecoverySummary(),
  rebuildProjectionsIfNeeded: () => store.rebuildProjectionsIfNeeded()
};
```

- [ ] **Step 4: Register the route file and rerun replay tests**

```ts
import { registerReplayRoutes } from "./routes/replay";

export function createControlPlaneApp(options?: {
  logger?: boolean;
  service?: OrchestratorService;
}) {
  const app = Fastify({ logger: options?.logger ?? true });
  const service = options?.service ?? defaultOrchestratorService;

  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);
  registerReplayRoutes(app, service);

  return app;
}
```

Run: `pnpm exec vitest run apps/control-plane/src/routes/replay.test.ts apps/control-plane/src/routes/tasks.test.ts`

Expected: PASS

- [ ] **Step 5: Commit the replay and recovery API layer**

```bash
git add apps/control-plane/src/store.ts apps/control-plane/src/services/orchestrator-service.ts apps/control-plane/src/server.ts apps/control-plane/src/routes/replay.ts apps/control-plane/src/routes/replay.test.ts
git commit -m "Add replay and recovery APIs"
```

## Task 5: Add The Web Replay UI

**Files:**
- Create: `apps/web/src/components/timeline-panel.tsx`
- Create: `apps/web/src/components/diff-inspector-panel.tsx`
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write the failing web replay test**

```tsx
it("shows recovery badges, timeline events, and diff details for the selected task", async () => {
  mockConsoleApi({
    recoverySummary: { tasksNeedingRecovery: 1, runsNeedingRecovery: 1 },
    events: [
      { id: 7, eventType: "task.approval_requested", occurredAt: "2026-04-03T10:00:00.000Z" }
    ],
    diffs: [
      { id: 8, changedPaths: ["/approvalRequest/prompt"], afterSubsetJson: { prompt: "Approve the decision brief?" } }
    ],
    replay: {
      task: { id: "task-1", title: "Build dashboard", status: "awaiting_approval" }
    }
  });

  render(<App />);

  expect(await screen.findByText("Recovery Required")).toBeVisible();
  expect(screen.getByText("task.approval_requested")).toBeVisible();
  expect(screen.getByText("/approvalRequest/prompt")).toBeVisible();
  expect(screen.getByRole("button", { name: "Replay Build dashboard" })).toBeVisible();
});
```

- [ ] **Step 2: Run the web test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/app.test.tsx`

Expected: FAIL with missing replay elements

- [ ] **Step 3: Add replay API helpers and focused replay panels**

```ts
export async function fetchTaskEvents(taskId: string) {
  return requestJson<Array<{ id: number; eventType: string; occurredAt: string }>>(
    `/api/tasks/${taskId}/events`
  );
}

export async function fetchTaskDiffs(taskId: string) {
  return requestJson<
    Array<{ id: number; changedPaths: string[]; afterSubsetJson: Record<string, unknown> }>
  >(`/api/tasks/${taskId}/diffs`);
}

export async function fetchTaskReplay(taskId: string, asOfEventId: number) {
  return requestJson<{ task: TaskRecord }>(
    `/api/tasks/${taskId}/replay?asOfEventId=${asOfEventId}`
  );
}

export async function fetchRecoverySummary() {
  return requestJson<{ tasksNeedingRecovery: number; runsNeedingRecovery: number }>(
    "/api/recovery/summary"
  );
}
```

```tsx
export function TimelinePanel(props: {
  events: Array<{ id: number; eventType: string; occurredAt: string }>;
  onReplay: (eventId: number) => void;
  taskTitle: string;
}) {
  return (
    <section className="panel panel-replay">
      <div className="panel-header">
        <h2>Replay Timeline</h2>
        <span>{props.events.length} events</span>
      </div>
      <ul className="detail-list">
        {props.events.map((event) => (
          <li key={event.id}>
            <div>
              <strong>{event.eventType}</strong>
              <span>{event.occurredAt}</span>
            </div>
            <button type="button" onClick={() => props.onReplay(event.id)}>
              {`Replay ${props.taskTitle}`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
export function DiffInspectorPanel(props: {
  diffs: Array<{ id: number; changedPaths: string[]; afterSubsetJson: Record<string, unknown> }>;
}) {
  return (
    <section className="panel panel-diff">
      <div className="panel-header">
        <h2>Diff Inspector</h2>
        <span>{props.diffs.length} entries</span>
      </div>
      <ul className="detail-list">
        {props.diffs.map((diff) => (
          <li key={diff.id}>
            <div>
              <strong>{diff.changedPaths.join(", ")}</strong>
              <span>{JSON.stringify(diff.afterSubsetJson)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Load replay data in `App` and rerun the UI tests**

```tsx
const [taskEvents, setTaskEvents] = useState<
  Record<string, Array<{ id: number; eventType: string; occurredAt: string }>>
>({});
const [taskDiffs, setTaskDiffs] = useState<
  Record<
    string,
    Array<{
      id: number;
      changedPaths: string[];
      afterSubsetJson: Record<string, unknown>;
    }>
  >
>({});
const [taskReplay, setTaskReplay] = useState<Record<string, TaskRecord>>({});
const [recoverySummary, setRecoverySummary] = useState({
  tasksNeedingRecovery: 0,
  runsNeedingRecovery: 0
});

useEffect(() => {
  Promise.all([fetchTasks(), fetchAgents(), fetchRecoverySummary()]).then(
    ([nextTasks, nextAgents, nextRecovery]) => {
      startTransition(() => {
        setTasks(nextTasks);
        setAgents(nextAgents);
        setRecoverySummary(nextRecovery);
      });
    }
  );
}, []);

async function handleReplay(taskId: string, eventId: number) {
  const replay = await fetchTaskReplay(taskId, eventId);
  startTransition(() => {
    setTaskReplay((current) => ({ ...current, [taskId]: replay.task }));
  });
}
```

Run: `pnpm exec vitest run apps/web/src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit the replay UI**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app.tsx apps/web/src/app.test.tsx apps/web/src/styles.css apps/web/src/components/timeline-panel.tsx apps/web/src/components/diff-inspector-panel.tsx
git commit -m "Add replay UI for persisted tasks"
```

## Task 6: Verify Recovery Across Restart

**Files:**
- Modify: `apps/acp-gateway/src/smoke.test.ts`
- Modify: `apps/control-plane/src/server.ts`
- Modify: `apps/acp-gateway/src/server.ts`

- [ ] **Step 1: Write the failing restart smoke test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createHttpACPClient } from "@feudal/acp/http-client";
import { createGatewayApp } from "./server";
import { createControlPlaneApp } from "../../control-plane/src/server";
import { createOrchestratorService } from "../../control-plane/src/services/orchestrator-service";
import type { CodexRunner } from "./workers/types";

describe("replay recovery smoke flow", () => {
  it("rebuilds persisted state after a simulated restart", async () => {
    const codexRunner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ title: "Build dashboard", prompt: "Create dashboard" })
        .mockResolvedValueOnce({ summary: "Plan and review the task." })
        .mockResolvedValueOnce({ verdict: "approve", note: "No blocking issues." })
        .mockResolvedValueOnce({ verdict: "approve", note: "Looks good." })
        .mockResolvedValueOnce({ result: "completed", output: "Executor finished the work." })
        .mockResolvedValueOnce({ result: "verified", output: "Verifier accepted the work." })
    } satisfies CodexRunner;

    const gateway = createGatewayApp({ logger: false, codexRunner });
    const service = createOrchestratorService({
      acpClient: createHttpACPClient({ baseUrl: "http://gateway.local" })
    });

    const controlPlane = createControlPlaneApp({ logger: false, service });
    const created = await controlPlane.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "Build dashboard",
        prompt: "Create the dashboard task",
        allowMock: false,
        requiresApproval: true,
        sensitivity: "medium"
      }
    });

    await Promise.all([controlPlane.close(), gateway.close()]);

    const restarted = createControlPlaneApp({ logger: false, service });
    const replay = await restarted.inject({
      method: "GET",
      url: `/api/tasks/${created.json().id}/replay?asOfEventId=${created.json().latestEventId}`
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json().task.status).toBe("awaiting_approval");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `pnpm exec vitest run apps/acp-gateway/src/smoke.test.ts`

Expected: FAIL because restart rebuild hooks are not wired yet

- [ ] **Step 3: Add startup replay hooks and database-backed bootstrapping**

```ts
export async function createControlPlaneApp(options?: {
  logger?: boolean;
  service?: OrchestratorService;
  onReady?: () => Promise<void>;
}) {
  const app = Fastify({ logger: options?.logger ?? true });
  const service = options?.service ?? defaultOrchestratorService;

  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);
  registerReplayRoutes(app, service);

  app.addHook("onReady", async () => {
    await service.rebuildProjectionsIfNeeded();
    await options?.onReady?.();
  });

  return app;
}
```

- [ ] **Step 4: Run the smoke test, full suite, and build**

Run: `pnpm exec vitest run apps/acp-gateway/src/smoke.test.ts && pnpm test && pnpm build`

Expected: PASS

- [ ] **Step 5: Commit the recovery verification**

```bash
git add apps/acp-gateway/src/smoke.test.ts apps/control-plane/src/server.ts apps/acp-gateway/src/server.ts
git commit -m "Verify persisted replay recovery flow"
```

## Spec Coverage Check

- Postgres-backed persistence is covered by Tasks 1, 2, and 3.
- Immutable business events and diff events are covered by Tasks 1, 2, and 3.
- Recovery markers and replay rebuild behavior are covered by Tasks 3 and 6.
- Replay and recovery APIs are covered by Task 4.
- Read-only replay UI is covered by Task 5, while the existing task detail view remains the current snapshot, runs, and artifacts surface.
- Operator write actions, login, and RBAC are intentionally not implemented in this plan.
