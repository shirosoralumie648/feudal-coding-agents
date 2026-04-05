import { TaskRecordSchema } from "@feudal/contracts";
import { createPostgresEventStore, runMigrations } from "@feudal/persistence";
import { newDb } from "pg-mem";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskReadModel } from "./task-read-model";

function toIsoString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

const task = TaskRecordSchema.parse({
  id: "task-1",
  title: "Build dashboard",
  prompt: "Create the dashboard task",
  status: "awaiting_approval",
  artifacts: [
    {
      id: "artifact-1",
      kind: "decision-brief",
      name: "decision-brief.json",
      mimeType: "application/json",
      content: { summary: "Plan the dashboard task." }
    }
  ],
  history: [
    {
      status: "intake",
      at: "2026-04-03T00:00:00.000Z",
      note: "task.submitted"
    },
    {
      status: "awaiting_approval",
      at: "2026-04-03T00:05:00.000Z",
      note: "task.awaiting_approval"
    }
  ],
  runIds: ["run-approval"],
  approvalRunId: "run-approval",
  runs: [
    {
      id: "run-approval",
      agent: "approval-gate",
      status: "awaiting",
      phase: "approval",
      awaitPrompt: "Approve the decision brief?",
      allowedActions: ["approve", "reject"]
    }
  ],
  approvalRequest: {
    runId: "run-approval",
    prompt: "Approve the decision brief?",
    actions: ["approve", "reject"]
  },
  createdAt: "2026-04-03T00:00:00.000Z",
  updatedAt: "2026-04-03T00:05:00.000Z"
});

const pools: Array<{ end: () => Promise<void> }> = [];

afterEach(async () => {
  while (pools.length > 0) {
    await pools.pop()?.end();
  }
});

async function createReadModel() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  pools.push(pool);
  await runMigrations(pool);
  const eventStore = createPostgresEventStore({ pool });
  return { pool, readModel: createTaskReadModel({ eventStore }) };
}

describe("task read model persistence projections", () => {
  it("saveTask persists task_history_entries rows and artifacts_current rows", async () => {
    const { pool, readModel } = await createReadModel();

    const projection = await readModel.saveTask(task, "task.awaiting_approval", 0);
    const historyRows = (
      await pool.query(
        `select task_id, ordinal, status, at, note
           from task_history_entries
          where task_id = $1
          order by ordinal asc`,
        [task.id]
      )
    ).rows;
    const artifactRows = (
      await pool.query(
        `select id, task_id, kind, name, mime_type, payload_json, latest_event_id, latest_projection_version
           from artifacts_current
          where task_id = $1`,
        [task.id]
      )
    ).rows;
    const normalizedHistoryRows = historyRows.map((row) => ({
      ...row,
      at: toIsoString(row.at)
    }));

    expect(normalizedHistoryRows).toEqual([
      {
        task_id: task.id,
        ordinal: 0,
        status: task.history[0]?.status,
        at: toIsoString(task.history[0]?.at),
        note: task.history[0]?.note
      },
      {
        task_id: task.id,
        ordinal: 1,
        status: task.history[1]?.status,
        at: toIsoString(task.history[1]?.at),
        note: task.history[1]?.note
      }
    ]);
    expect(artifactRows).toEqual([
      {
        id: task.artifacts[0]?.id,
        task_id: task.id,
        kind: task.artifacts[0]?.kind,
        name: task.artifacts[0]?.name,
        mime_type: task.artifacts[0]?.mimeType,
        payload_json: task.artifacts[0]?.content,
        latest_event_id: projection.latestEventId,
        latest_projection_version: projection.latestProjectionVersion
      }
    ]);
  });

  it("rebuildProjectionsIfNeeded restores history and artifacts from events", async () => {
    const { pool, readModel } = await createReadModel();

    await readModel.saveTask(task, "task.awaiting_approval", 0);

    await pool.query("delete from tasks_current");
    await pool.query("delete from task_history_entries");
    await pool.query("delete from artifacts_current");
    await pool.query("delete from projection_checkpoint");

    await readModel.rebuildProjectionsIfNeeded();

    await expect(readModel.listTaskArtifacts(task.id)).resolves.toEqual(task.artifacts);
    await expect(readModel.getTask(task.id)).resolves.toMatchObject({
      id: task.id,
      history: task.history,
      artifacts: task.artifacts
    });
  });

  it("records operator actions for approval and rejection events", async () => {
    const { pool, readModel } = await createReadModel();

    await readModel.saveTask(
      {
        ...task,
        status: "completed",
        approvalRunId: undefined,
        approvalRequest: undefined,
        runs: [],
        runIds: [],
        updatedAt: "2026-04-03T00:10:00.000Z"
      },
      "task.approved",
      0
    );

    await readModel.saveTask(
      {
        ...task,
        status: "rejected",
        approvalRunId: undefined,
        approvalRequest: undefined,
        updatedAt: "2026-04-03T00:12:00.000Z"
      },
      "task.rejected",
      2
    );

    const actionRows = (
      await pool.query(
        `select action_type, status
           from operator_actions
          where task_id = $1
          order by id asc`,
        [task.id]
      )
    ).rows;

    expect(actionRows).toEqual([
      { action_type: "approve", status: "applied" },
      { action_type: "reject", status: "applied" }
    ]);
  });

  it("records revise operator actions and keeps governance data in rebuilt tasks", async () => {
    const { pool, readModel } = await createReadModel();

    await readModel.saveTask(
      {
        ...task,
        status: "planning",
        governance: {
          requestedRequiresApproval: false,
          effectiveRequiresApproval: true,
          allowMock: true,
          sensitivity: "high",
          executionMode: "mock_fallback_used",
          policyReasons: ["high sensitivity forced approval"],
          reviewVerdict: "approved",
          allowedActions: [],
          revisionCount: 1
        },
        revisionRequest: undefined,
        updatedAt: "2026-04-03T00:15:00.000Z"
      },
      "task.revision_submitted",
      0
    );

    const actionRows = (
      await pool.query(
        `select action_type, status
           from operator_actions
          where task_id = $1`,
        [task.id]
      )
    ).rows;

    expect(actionRows).toContainEqual({
      action_type: "revise",
      status: "applied"
    });

    await pool.query("delete from tasks_current");
    await pool.query("delete from task_history_entries");
    await pool.query("delete from artifacts_current");
    await pool.query("delete from projection_checkpoint");

    await readModel.rebuildProjectionsIfNeeded();

    await expect(readModel.getTask(task.id)).resolves.toMatchObject({
      governance: {
        executionMode: "mock_fallback_used",
        revisionCount: 1
      }
    });
  });

  it("lists task runs from runs_current and marks rebuilt in-flight tasks as recovery_required", async () => {
    const { pool, readModel } = await createReadModel();

    await readModel.saveTask(
      {
        ...task,
        status: "executing",
        runs: [],
        runIds: [],
        approvalRunId: undefined,
        approvalRequest: undefined,
        updatedAt: "2026-04-03T00:20:00.000Z"
      },
      "task.executing",
      0
    );

    await pool.query(
      `insert into runs_current (
         id, task_id, agent, status, phase, recovery_state, recovery_reason,
         last_recovered_at, latest_event_id, latest_projection_version, payload_json, updated_at
       ) values (
         'run-execution',
         'task-1',
         'gongbu-executor',
         'completed',
         'execution',
         'healthy',
         null,
         '2026-04-03T00:20:00.000Z',
         4,
         4,
         '{"id":"run-execution","taskId":"task-1","agent":"gongbu-executor","status":"completed","phase":"execution","messages":[],"artifacts":[]}'::jsonb,
         '2026-04-03T00:20:00.000Z'
       )`
    );

    await expect(readModel.listTaskRuns(task.id)).resolves.toEqual([
      {
        id: "run-execution",
        agent: "gongbu-executor",
        status: "completed",
        phase: "execution"
      }
    ]);

    await pool.query("delete from tasks_current");
    await pool.query("delete from task_history_entries");
    await pool.query("delete from artifacts_current");
    await pool.query("delete from projection_checkpoint");

    await readModel.rebuildProjectionsIfNeeded();

    await expect(readModel.getRecoverySummary()).resolves.toEqual({
      tasksNeedingRecovery: 1,
      runsNeedingRecovery: 0
    });
  });

  it("infers approval phase when persisted task-linked runs omit phase", async () => {
    const { pool, readModel } = await createReadModel();

    await readModel.saveTask(task, "task.awaiting_approval", 0);

    await pool.query(
      `insert into runs_current (
         id, task_id, agent, status, phase, recovery_state, recovery_reason,
         last_recovered_at, latest_event_id, latest_projection_version, payload_json, updated_at
       ) values (
         'run-approval',
         'task-1',
         'approval-gate',
         'awaiting',
         null,
         'healthy',
         null,
         '2026-04-03T00:05:00.000Z',
         2,
         2,
         '{"id":"run-approval","taskId":"task-1","agent":"approval-gate","status":"awaiting","messages":[],"artifacts":[],"awaitPrompt":"Approve the decision brief?","allowedActions":["approve","reject"]}'::jsonb,
         '2026-04-03T00:05:00.000Z'
       )
       on conflict (id) do update set
         task_id = excluded.task_id,
         agent = excluded.agent,
         status = excluded.status,
         phase = excluded.phase,
         recovery_state = excluded.recovery_state,
         recovery_reason = excluded.recovery_reason,
         last_recovered_at = excluded.last_recovered_at,
         latest_event_id = excluded.latest_event_id,
         latest_projection_version = excluded.latest_projection_version,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`
    );

    await expect(readModel.listTaskRuns(task.id)).resolves.toContainEqual({
      id: "run-approval",
      agent: "approval-gate",
      status: "awaiting",
      phase: "approval",
      awaitPrompt: "Approve the decision brief?",
      allowedActions: ["approve", "reject"]
    });
  });
});
