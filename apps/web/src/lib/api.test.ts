import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTaskDiffs, reviseTask } from "./api";

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
