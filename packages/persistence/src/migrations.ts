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
