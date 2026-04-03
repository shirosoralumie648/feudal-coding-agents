import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTaskDiffs } from "./api";

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
