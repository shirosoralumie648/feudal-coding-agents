import { describe, expect, it } from "vitest";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createControlPlaneApp } from "../server";
import { createOrchestratorService } from "../services/orchestrator-service";

function createReplayApp() {
  return createControlPlaneApp({
    logger: false,
    service: createOrchestratorService({
      acpClient: createMockACPClient()
    })
  });
}

describe("replay routes", () => {
  it("returns events, diffs, replay snapshots, and recovery summary", async () => {
    const app = createReplayApp();
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
    const artifacts = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/artifacts`
    });
    const replay = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/replay?asOfEventId=${created.json().latestEventId}`
    });
    const recovery = await app.inject({
      method: "GET",
      url: "/api/recovery/summary"
    });

    expect(events.statusCode).toBe(200);
    expect(events.json().length).toBeGreaterThan(0);
    expect(diffs.json().length).toBeGreaterThan(0);
    expect(runs.json().length).toBeGreaterThan(0);
    expect(artifacts.json().length).toBeGreaterThan(0);
    expect(replay.json().task.id).toBe(taskId);
    expect(recovery.json().tasksNeedingRecovery).toBeGreaterThanOrEqual(0);
  });
});
