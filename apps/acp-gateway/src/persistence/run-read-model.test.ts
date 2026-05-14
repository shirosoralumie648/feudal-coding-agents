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
          payloadJson: {
            id: "run-1",
            agent: "gongbu-executor",
            status: "created",
            messages: [],
            artifacts: []
          },
          metadataJson: { actorType: "system" }
        },
        {
          eventType: "run.status_transitioned",
          payloadJson: {
            id: "run-1",
            agent: "gongbu-executor",
            status: "in-progress",
            messages: [],
            artifacts: []
          },
          metadataJson: { actorType: "system" }
        }
      ]
    });

    await readModel.rebuild();
    const run = await readModel.getRun("run-1");

    expect(run?.recoveryState).toBe("recovery_required");
    expect(run?.recoveryReason).toContain("in-progress");
  });

  it("preserves an empty await prompt across persistence and rebuild", async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    const eventStore = createPostgresEventStore({ pool });
    const readModel = createRunReadModel({ eventStore });

    await readModel.saveRun(
      {
        id: "run-empty-prompt",
        agent: "approval-needed",
        status: "awaiting",
        messages: [],
        artifacts: [],
        awaitPrompt: "",
        allowedActions: ["approve", "reject"]
      },
      "run.created",
      0
    );

    await pool.query("delete from runs_current");
    await pool.query(
      "delete from projection_checkpoint where projection_name = 'runs_current'"
    );

    await readModel.rebuild();
    const run = await readModel.getRun("run-empty-prompt");

    expect(run?.awaitPrompt).toBe("");
  });

  it("writes task_id into runs_current and restores it on rebuild", async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    const eventStore = createPostgresEventStore({ pool });
    const readModel = createRunReadModel({ eventStore });

    await readModel.saveRun(
      {
        id: "run-task-linked",
        taskId: "task-1",
        agent: "analyst-agent",
        status: "completed",
        phase: "planning",
        messages: [],
        artifacts: []
      },
      "run.completed",
      0
    );

    const beforeRebuild = await pool.query(
      "select task_id from runs_current where id = $1",
      ["run-task-linked"]
    );
    expect(beforeRebuild.rows[0]?.task_id).toBe("task-1");

    await pool.query("delete from runs_current");
    await pool.query(
      "delete from projection_checkpoint where projection_name = 'runs_current'"
    );

    await readModel.rebuild();
    const run = await readModel.getRun("run-task-linked");

    expect(run?.taskId).toBe("task-1");
  });

  it("treats cancelled runs as stable after rebuild", async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    const eventStore = createPostgresEventStore({ pool });
    const readModel = createRunReadModel({ eventStore });

    await eventStore.append({
      streamType: "run",
      streamId: "run-cancelled",
      expectedVersion: 0,
      events: [
        {
          eventType: "run.created",
          payloadJson: {
            id: "run-cancelled",
            agent: "gongbu-executor",
            status: "created",
            phase: "execution",
            messages: [],
            artifacts: []
          },
          metadataJson: { actorType: "system" }
        },
        {
          eventType: "run.status_transitioned",
          payloadJson: {
            id: "run-cancelled",
            agent: "gongbu-executor",
            status: "cancelled",
            phase: "execution",
            messages: [],
            artifacts: []
          },
          metadataJson: { actorType: "system" }
        }
      ]
    });

    await readModel.rebuild();
    const run = await readModel.getRun("run-cancelled");

    expect(run?.recoveryState).toBe("healthy");
    expect(run?.phase).toBe("execution");
  });

  it("marks cancelling runs as recovery_required after rebuild", async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    const eventStore = createPostgresEventStore({ pool });
    const readModel = createRunReadModel({ eventStore });

    await eventStore.append({
      streamType: "run",
      streamId: "run-cancelling",
      expectedVersion: 0,
      events: [
        {
          eventType: "run.created",
          payloadJson: {
            id: "run-cancelling",
            agent: "gongbu-executor",
            status: "created",
            phase: "execution",
            messages: [],
            artifacts: []
          },
          metadataJson: { actorType: "system" }
        },
        {
          eventType: "run.status_transitioned",
          payloadJson: {
            id: "run-cancelling",
            agent: "gongbu-executor",
            status: "cancelling",
            phase: "execution",
            messages: [],
            artifacts: []
          },
          metadataJson: { actorType: "system" }
        }
      ]
    });

    await readModel.rebuild();
    const run = await readModel.getRun("run-cancelling");

    expect(run?.recoveryState).toBe("recovery_required");
    expect(run?.phase).toBe("execution");
  });
});
