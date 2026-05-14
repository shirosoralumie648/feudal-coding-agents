import type { ACPRun } from "@feudal/acp";
import type { TaskRecord } from "@feudal/contracts";
import { describe, expect, it, vi } from "vitest";
import { toTaskProjectionRecord } from "../persistence/task-event-codec";
import { runExecutionAndVerification } from "./orchestrator-flows";

function createTask(): TaskRecord {
  const now = "2026-05-02T00:00:00.000Z";

  return {
    id: "task-1",
    title: "Build dashboard",
    prompt: "Create the dashboard",
    status: "dispatching",
    artifacts: [],
    history: [{ status: "dispatching", at: now, note: "ready" }],
    runIds: [],
    runs: [],
    operatorAllowedActions: ["abandon"],
    createdAt: now,
    updatedAt: now
  };
}

function createRun(
  id: string,
  agent: string,
  content: unknown,
  phase: ACPRun["phase"]
): ACPRun {
  return {
    id,
    agent,
    status: "completed",
    phase,
    messages: [],
    artifacts: [
      {
        id: `${id}-artifact`,
        name: "result.json",
        mimeType: "application/json",
        content
      }
    ]
  };
}

describe("runExecutionAndVerification security scan", () => {
  it("blocks high risk executor output before verifier dispatch", async () => {
    const runStep = vi.fn(async (task: TaskRecord, phase: ACPRun["phase"]) => {
      if (phase === "execution") {
        return {
          task,
          run: createRun("run-execution", "gongbu-executor", 'eval("x")', phase)
        };
      }

      throw new Error("verifier should not run");
    });
    const persistTask = vi.fn(async (task: TaskRecord) =>
      toTaskProjectionRecord({
        task,
        recoveryState: "healthy",
        latestEventId: 1,
        latestProjectionVersion: 1
      })
    );

    const result = await runExecutionAndVerification({
      task: createTask(),
      persistTask,
      runMetadata: {},
      runStep
    });

    expect(result.status).toBe("failed");
    expect(runStep).toHaveBeenCalledTimes(1);
    expect(runStep).not.toHaveBeenCalledWith(
      expect.anything(),
      "verification",
      expect.anything()
    );
    expect(result.artifacts).toContainEqual(
      expect.objectContaining({
        kind: "execution-report",
        content: expect.objectContaining({
          reason: "execution_security_scan_blocked",
          securityScan: expect.objectContaining({ blocked: true })
        })
      })
    );
    expect(result.runs).toContainEqual(
      expect.objectContaining({
        id: "run-execution",
        phase: "execution"
      })
    );
  });

  it("allows safe executor output to reach verifier success", async () => {
    const runStep = vi.fn(async (task: TaskRecord, phase: ACPRun["phase"]) => {
      if (phase === "execution") {
        return {
          task,
          run: createRun(
            "run-execution",
            "gongbu-executor",
            { summary: "Created dashboard." },
            phase
          )
        };
      }

      return {
        task,
        run: createRun(
          "run-verification",
          "xingbu-verifier",
          { result: "verified" },
          phase
        )
      };
    });
    const persistTask = vi.fn(async (task: TaskRecord) =>
      toTaskProjectionRecord({
        task,
        recoveryState: "healthy",
        latestEventId: 1,
        latestProjectionVersion: 1
      })
    );

    const result = await runExecutionAndVerification({
      task: createTask(),
      persistTask,
      runMetadata: {},
      runStep
    });

    expect(result.status).toBe("completed");
    expect(runStep).toHaveBeenCalledWith(
      expect.anything(),
      "verification",
      expect.objectContaining({
        agent: "xingbu-verifier"
      })
    );
    expect(
      runStep.mock.calls.filter((call) => call[1] === "verification")
    ).toHaveLength(1);
  });
});
