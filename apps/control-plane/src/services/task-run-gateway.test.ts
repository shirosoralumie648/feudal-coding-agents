import { describe, expect, it, vi } from "vitest";
import type { ACPClient, ACPRun } from "@feudal/acp";
import { createMockACPClient } from "@feudal/acp/mock-client";
import { createTaskRunGateway } from "./task-run-gateway";

function completedRun(id: string, agent: string): ACPRun {
  return {
    id,
    agent,
    status: "completed",
    messages: [],
    artifacts: []
  };
}

function createStubClient(overrides: Partial<ACPClient> = {}): ACPClient {
  return {
    listAgents: async () => [],
    runAgent: async () => completedRun("run-default", "stub-agent"),
    awaitExternalInput: async () => ({
      id: "run-await",
      agent: "stub-await",
      status: "awaiting",
      messages: [],
      artifacts: [],
      awaitPrompt: "Approve?",
      allowedActions: ["approve", "reject"]
    }),
    respondToAwait: async (_runId, _response) => completedRun("run-response", "stub-await"),
    getRun: async () => undefined,
    ...overrides
  };
}

describe("task run gateway", () => {
  it("falls back to mock on real failure and latches mock mode for subsequent runs", async () => {
    const realBase = createMockACPClient();
    const realRunAgent = vi.fn().mockRejectedValue(new Error("real ACP unavailable"));
    const realClient: ACPClient = { ...realBase, runAgent: realRunAgent };
    const gateway = createTaskRunGateway({
      realClient,
      mockClient: createMockACPClient()
    });

    const first = await gateway.runAgent(
      { executionMode: "real_with_mock_fallback" },
      {
        agent: "analyst-agent",
        messages: [{ role: "user", content: "Plan the task" }]
      }
    );
    const second = await gateway.runAgent(
      { executionMode: first.executionMode },
      {
        agent: "critic-agent",
        messages: [{ role: "user", content: "Review the task" }]
      }
    );

    expect(first.executionMode).toBe("mock_fallback_used");
    expect(second.executionMode).toBe("mock_fallback_used");
    expect(realRunAgent).toHaveBeenCalledTimes(1);
    expect(first.value.agent).toBe("analyst-agent");
    expect(second.value.agent).toBe("critic-agent");
  });

  it("uses mock client for respondToAwait when execution mode is mock_fallback_used", async () => {
    const realRespondToAwait = vi
      .fn<ACPClient["respondToAwait"]>()
      .mockResolvedValue(completedRun("run-real", "real-await"));
    const mockRespondToAwait = vi
      .fn<ACPClient["respondToAwait"]>()
      .mockResolvedValue(completedRun("run-mock", "mock-await"));
    const gateway = createTaskRunGateway({
      realClient: createStubClient({ respondToAwait: realRespondToAwait }),
      mockClient: createStubClient({ respondToAwait: mockRespondToAwait })
    });

    const run = await gateway.respondToAwait(
      { executionMode: "mock_fallback_used" },
      "run-1",
      { role: "user", content: "approve" }
    );

    expect(mockRespondToAwait).toHaveBeenCalledTimes(1);
    expect(realRespondToAwait).not.toHaveBeenCalled();
    expect(run.id).toBe("run-mock");
  });

  it("uses real client for respondToAwait when execution mode is real", async () => {
    const realRespondToAwait = vi
      .fn<ACPClient["respondToAwait"]>()
      .mockResolvedValue(completedRun("run-real", "real-await"));
    const mockRespondToAwait = vi
      .fn<ACPClient["respondToAwait"]>()
      .mockResolvedValue(completedRun("run-mock", "mock-await"));
    const gateway = createTaskRunGateway({
      realClient: createStubClient({ respondToAwait: realRespondToAwait }),
      mockClient: createStubClient({ respondToAwait: mockRespondToAwait })
    });

    const run = await gateway.respondToAwait(
      { executionMode: "real" },
      "run-1",
      { role: "user", content: "approve" }
    );

    expect(realRespondToAwait).toHaveBeenCalledTimes(1);
    expect(mockRespondToAwait).not.toHaveBeenCalled();
    expect(run.id).toBe("run-real");
  });

  it("throws when real execution is requested without a real client", async () => {
    const gateway = createTaskRunGateway({
      mockClient: createMockACPClient()
    });

    await expect(
      gateway.runAgent(
        { executionMode: "real" },
        {
          agent: "analyst-agent",
          messages: [{ role: "user", content: "Plan the task" }]
        }
      )
    ).rejects.toThrow("Real ACP client is not configured");
  });

  it("throws for respondToAwait when non-mock mode lacks a real client", async () => {
    const gateway = createTaskRunGateway({
      mockClient: createMockACPClient()
    });

    await expect(
      gateway.respondToAwait(
        { executionMode: "real_with_mock_fallback" },
        "run-1",
        { role: "user", content: "approve" }
      )
    ).rejects.toThrow("Real ACP client is not configured");
  });
});
