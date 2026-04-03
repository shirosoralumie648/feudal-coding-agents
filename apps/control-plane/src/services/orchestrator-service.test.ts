import { describe, expect, it } from "vitest";
import type { ACPClient, ACPRunAgentInput, ACPAwaitExternalInput } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createOrchestratorService } from "./orchestrator-service";
import { MemoryTaskStore } from "../store";

class RecordingTaskStore extends MemoryTaskStore {
  constructor(private readonly eventLog: string[]) {
    super();
  }

  override async saveTask(task, eventType, expectedVersion) {
    this.eventLog.push(`save:${eventType}:${task.status}:${expectedVersion}`);
    return super.saveTask(task, eventType, expectedVersion);
  }
}

function createRecordingACPClient(events: string[]): ACPClient {
  const base = createMockACPClient();

  return {
    ...base,
    async runAgent(input: ACPRunAgentInput) {
      events.push(`run:${input.agent}`);
      return base.runAgent(input);
    },
    async awaitExternalInput(input: ACPAwaitExternalInput) {
      events.push(`await:${input.label}`);
      return base.awaitExternalInput(input);
    },
    async respondToAwait(runId, response) {
      events.push(`respond:${runId}:${response.content}`);
      return base.respondToAwait(runId, response);
    }
  };
}

describe("orchestrator service durability", () => {
  it("persists task state before opening the approval gate", async () => {
    const events: string[] = [];
    const service = createOrchestratorService({
      acpClient: createRecordingACPClient(events),
      store: new RecordingTaskStore(events)
    });

    await service.createTask({
      id: "task-durable-create",
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    const firstSaveIndex = events.findIndex((event) => event.startsWith("save:"));
    const awaitIndex = events.findIndex((event) => event.startsWith("await:"));

    expect(firstSaveIndex).toBeGreaterThanOrEqual(0);
    expect(awaitIndex).toBeGreaterThan(firstSaveIndex);
  });

  it("persists approval consumption before starting execution", async () => {
    const events: string[] = [];
    const service = createOrchestratorService({
      acpClient: createRecordingACPClient(events),
      store: new RecordingTaskStore(events)
    });

    const created = await service.createTask({
      id: "task-durable-approve",
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    events.length = 0;

    await service.approveTask(created.id);

    const respondIndex = events.findIndex((event) => event.startsWith("respond:"));
    const firstSaveIndex = events.findIndex((event) => event.startsWith("save:"));
    const executeIndex = events.findIndex((event) => event === "run:gongbu-executor");

    expect(respondIndex).toBeGreaterThanOrEqual(0);
    expect(firstSaveIndex).toBeGreaterThan(respondIndex);
    expect(executeIndex).toBeGreaterThan(firstSaveIndex);
  });
});
