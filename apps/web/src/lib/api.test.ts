import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abandonTask,
  fetchOperatorSummary,
  fetchTaskDiffs,
  fetchTaskOperatorActions,
  recoverTask,
  reviseTask,
  takeoverTask
} from "./api";

describe("fetchTaskDiffs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes persisted diff events from payloadJson into UI diff entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 11,
            eventType: "task.diff_recorded",
            payloadJson: {
              changedPaths: ["/approvalRequest", "/runs"],
              afterSubsetJson: {
                approvalRequest: { prompt: "Approve the decision brief?" }
              }
            }
          }
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTaskDiffs("task-1")).resolves.toEqual([
      {
        id: 11,
        changedPaths: ["/approvalRequest", "/runs"],
        afterSubsetJson: {
          approvalRequest: { prompt: "Approve the decision brief?" }
        }
      }
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1/diffs", undefined);
  });
});

describe("reviseTask", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts revision notes to the governance route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "task-1",
          title: "Governance task",
          prompt: "Exercise the workflow",
          status: "awaiting_approval",
          artifacts: [],
          history: [],
          runIds: [],
          runs: [],
          governance: {
            requestedRequiresApproval: false,
            effectiveRequiresApproval: true,
            allowMock: true,
            sensitivity: "high",
            executionMode: "mock_fallback_used",
            policyReasons: ["high sensitivity forced approval"],
            reviewVerdict: "approved",
            allowedActions: ["approve", "reject"],
            revisionCount: 1
          },
          createdAt: "2026-04-04T00:00:00.000Z",
          updatedAt: "2026-04-04T00:05:00.000Z"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    await reviseTask("task-1", "Revision note: tighten rollback scope.");

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1/revise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        note: "Revision note: tighten rollback scope."
      })
    });
  });
});

describe("operator action api helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts recover and takeover notes to the operator routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "dispatching" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "planning" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await recoverTask("task-1", "Retry after restoring the executor.");
    await takeoverTask("task-1", "Re-plan with a stronger rollback note.");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tasks/task-1/operator-actions/recover",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Retry after restoring the executor." })
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/tasks/task-1/operator-actions/takeover",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Re-plan with a stronger rollback note." })
      }
    );
  });

  it("posts abandon notes with explicit confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "task-1", status: "abandoned" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await abandonTask("task-1", "Stop this task.");

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1/operator-actions/abandon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "Stop this task.", confirm: true })
    });
  });

  it("loads operator history and operator summary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 1,
              actionType: "takeover",
              status: "applied",
              note: "Re-plan",
              actorType: "user",
              taskId: "task-1",
              createdAt: "2026-04-05T00:00:00.000Z",
              appliedAt: "2026-04-05T00:00:01.000Z"
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tasksNeedingOperatorAttention: 1, tasks: [] }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    await fetchTaskOperatorActions("task-1");
    await fetchOperatorSummary();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tasks/task-1/operator-actions",
      undefined
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/operator-actions/summary",
      undefined
    );
  });
});
