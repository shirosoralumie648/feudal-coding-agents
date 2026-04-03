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
});
