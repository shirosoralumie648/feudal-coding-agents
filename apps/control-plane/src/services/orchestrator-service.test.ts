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
  it("passes taskId metadata into every ACP run created for a task", async () => {
    const metadataLog: string[] = [];
    const base = createMockACPClient();
    const acpClient: ACPClient = {
      ...base,
      async runAgent(input: ACPRunAgentInput) {
        metadataLog.push(`${input.agent}:${input.metadata?.taskId as string | undefined}`);
        return base.runAgent(input);
      },
      async awaitExternalInput(input: ACPAwaitExternalInput) {
        const inputWithMetadata = input as ACPAwaitExternalInput & {
          metadata?: { taskId?: string };
        };
        metadataLog.push(`${input.label}:${inputWithMetadata.metadata?.taskId}`);
        return base.awaitExternalInput(input);
      }
    };

    const service = createOrchestratorService({ acpClient });
    const created = await service.createTask({
      id: "task-metadata",
      title: "Metadata task",
      prompt: "Thread metadata through all runs",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    await service.approveTask(created.id);

    expect(metadataLog).toEqual([
      "intake-agent:task-metadata",
      "analyst-agent:task-metadata",
      "auditor-agent:task-metadata",
      "critic-agent:task-metadata",
      "approval-gate:task-metadata",
      "gongbu-executor:task-metadata",
      "xingbu-verifier:task-metadata"
    ]);
  });

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

  it("persists rejection consumption without starting execution", async () => {
    const events: string[] = [];
    const service = createOrchestratorService({
      acpClient: createRecordingACPClient(events),
      store: new RecordingTaskStore(events)
    });

    const created = await service.createTask({
      id: "task-durable-reject",
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    });

    events.length = 0;

    await service.rejectTask(created.id);

    const respondIndex = events.findIndex((event) => event.startsWith("respond:"));
    const firstSaveIndex = events.findIndex((event) => event.startsWith("save:"));
    const executeIndex = events.findIndex((event) => event === "run:gongbu-executor");

    expect(respondIndex).toBeGreaterThanOrEqual(0);
    expect(firstSaveIndex).toBeGreaterThan(respondIndex);
    expect(executeIndex).toBe(-1);
    expect(events).toContain("save:task.rejected:rejected:10");
  });
});
