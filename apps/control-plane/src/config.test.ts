import { describe, expect, it, vi } from "vitest";
import type { OperatorActionRecord, OperatorActionSummary } from "@feudal/contracts";
import { createLazyTaskStore } from "./config";
import type { TaskStore } from "./store";

describe("createLazyTaskStore", () => {
  it("proxies operator action reads and writes to the loaded store", async () => {
    const operatorActions: OperatorActionRecord[] = [
      {
        id: 1,
        taskId: "task-operator",
        actionType: "takeover",
        status: "applied",
        note: "Re-plan this task.",
        actorType: "operator",
        createdAt: "2026-04-06T00:00:00.000Z",
        appliedAt: "2026-04-06T00:00:01.000Z"
      }
    ];
    const summary: OperatorActionSummary = {
      tasksNeedingOperatorAttention: 1,
      tasks: [
        {
          id: "task-operator",
          title: "Operator task",
          status: "awaiting_approval",
          recoveryState: "healthy",
          operatorAllowedActions: ["takeover", "abandon"]
        }
      ]
    };
    const store = {
      listTasks: vi.fn().mockResolvedValue([]),
      getTask: vi.fn().mockResolvedValue(undefined),
      saveTask: vi.fn(),
      recordOperatorAction: vi.fn().mockResolvedValue(undefined),
      listOperatorActions: vi.fn().mockResolvedValue(operatorActions),
      getOperatorActionSummary: vi.fn().mockResolvedValue(summary),
      listTaskEvents: vi.fn().mockResolvedValue([]),
      listTaskDiffs: vi.fn().mockResolvedValue([]),
      listTaskRuns: vi.fn().mockResolvedValue([]),
      listTaskArtifacts: vi.fn().mockResolvedValue([]),
      replayTaskAtEventId: vi.fn().mockResolvedValue(undefined),
      getRecoverySummary: vi.fn().mockResolvedValue({
        tasksNeedingRecovery: 0,
        runsNeedingRecovery: 0,
        taskBreakdown: {
          healthy: 0,
          replaying: 0,
          recoveryRequired: 0
        },
        runRecoveryBreakdown: {
          healthy: 0,
          replaying: 0,
          recoveryRequired: 0
        },
        runStatusBreakdown: {
          created: 0,
          inProgress: 0,
          awaiting: 0,
          completed: 0,
          failed: 0,
          cancelling: 0,
          cancelled: 0
        }
      }),
      rebuildProjectionsIfNeeded: vi.fn().mockResolvedValue(undefined)
    } satisfies TaskStore;

    const lazyStore = createLazyTaskStore(async () => store);

    await expect(lazyStore.listOperatorActions("task-operator")).resolves.toEqual(
      operatorActions
    );
    await expect(lazyStore.getOperatorActionSummary()).resolves.toEqual(summary);

    await lazyStore.recordOperatorAction({
      taskId: "task-operator",
      actionType: "takeover",
      status: "requested",
      note: "Re-plan this task."
    });

    expect(store.listOperatorActions).toHaveBeenCalledWith("task-operator");
    expect(store.getOperatorActionSummary).toHaveBeenCalledTimes(1);
    expect(store.recordOperatorAction).toHaveBeenCalledWith({
      taskId: "task-operator",
      actionType: "takeover",
      status: "requested",
      note: "Re-plan this task."
    });
  });
});
