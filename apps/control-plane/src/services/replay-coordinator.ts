import type { TaskStore } from "../store";
import type { ReplayCoordinator } from "./orchestrator-types";

export function createReplayCoordinator(options: {
  store: TaskStore;
}): ReplayCoordinator {
  return {
    async listEvents(taskId) {
      return options.store.listTaskEvents(taskId);
    },

    async listDiffs(taskId) {
      return options.store.listTaskDiffs(taskId);
    },

    async listRuns(taskId) {
      return options.store.listTaskRuns(taskId);
    },

    async listArtifacts(taskId) {
      return options.store.listTaskArtifacts(taskId);
    },

    async replayTaskAtEventId(taskId, eventId) {
      return options.store.replayTaskAtEventId(taskId, eventId);
    },

    async getRecoverySummary() {
      return options.store.getRecoverySummary();
    }
  };
}
