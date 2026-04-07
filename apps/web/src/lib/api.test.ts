import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveTask,
  abandonTask,
  fetchOperatorSummary,
  fetchTaskDiffs,
  fetchTaskOperatorActions,
  rejectTask,
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

describe("governance action api helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts revision notes to the unified governance route", async () => {
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

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1/governance-actions/revise",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          note: "Revision note: tighten rollback scope."
        })
      }
    );
  });

  it("posts approve and reject using empty json bodies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "approved" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "rejected" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    await approveTask("task-1");
    await rejectTask("task-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tasks/task-1/governance-actions/approve",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/tasks/task-1/governance-actions/reject",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      }
    );
  });

  it("uses unified governance route for all governance actions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "approved" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "rejected" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "task-1", status: "awaiting_approval" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    await approveTask("task-1");
    await rejectTask("task-1");
    await reviseTask("task-1", "Need another revision pass.");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/tasks/task-1/governance-actions/approve",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/tasks/task-1/governance-actions/reject",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/tasks/task-1/governance-actions/revise",
      expect.any(Object)
    );
  });

  it("does not call legacy governance routes", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "task-1", status: "awaiting_approval" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    vi.stubGlobal("fetch", fetchMock);

    await approveTask("task-1");
    await rejectTask("task-1");
    await reviseTask("task-1", "Revise");

    const calledPaths = fetchMock.mock.calls.map(([path]) => path);

    expect(calledPaths).not.toContain("/api/tasks/task-1/approve");
    expect(calledPaths).not.toContain("/api/tasks/task-1/reject");
    expect(calledPaths).not.toContain("/api/tasks/task-1/revise");
    expect(calledPaths).toEqual([
      "/api/tasks/task-1/governance-actions/approve",
      "/api/tasks/task-1/governance-actions/reject",
      "/api/tasks/task-1/governance-actions/revise"
    ]);
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
