import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpACPClient } from "./http-client";

describe("HTTP ACP client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listAgents() requests /agents", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpACPClient({ baseUrl: "https://acp.example.com/" });
    await client.listAgents();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acp.example.com/agents",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("respondToAwait() posts to /runs/:runId and returns completed status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "run-1",
        agent: "approval-gate",
        status: "completed",
        messages: [{ role: "user", content: "approve" }],
        artifacts: []
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpACPClient({ baseUrl: "https://acp.example.com" });
    const run = await client.respondToAwait("run-1", {
      role: "user",
      content: "approve"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acp.example.com/runs/run-1",
      expect.objectContaining({ method: "POST" })
    );
    expect(run.status).toBe("completed");
  });

  it("runAgent() posts kind=agent-run payload to /runs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "run-2",
        agent: "analyst-agent",
        status: "in-progress",
        messages: [],
        artifacts: []
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpACPClient({ baseUrl: "https://acp.example.com" });
    await client.runAgent({
      agent: "analyst-agent",
      messages: [{ role: "user", content: "analyze task" }],
      metadata: { taskId: "task-1" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acp.example.com/runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          kind: "agent-run",
          agent: "analyst-agent",
          messages: [{ role: "user", content: "analyze task" }],
          metadata: { taskId: "task-1" }
        })
      })
    );
  });

  it("awaitExternalInput() forwards metadata for task-linked approval runs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "run-3",
        agent: "approval",
        status: "awaiting",
        messages: [],
        artifacts: [],
        awaitPrompt: "Approve?",
        allowedActions: ["approve", "reject"]
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpACPClient({ baseUrl: "https://acp.example.com" });
    await client.awaitExternalInput({
      label: "approval-gate",
      prompt: "Approve?",
      actions: ["approve", "reject"],
      metadata: { taskId: "task-1" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acp.example.com/runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          kind: "await",
          label: "approval-gate",
          prompt: "Approve?",
          actions: ["approve", "reject"],
          metadata: { taskId: "task-1" }
        })
      })
    );
  });

  it("getRun() requests GET /runs/:runId and returns parsed run on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: "run-4",
        agent: "auditor-agent",
        status: "completed",
        messages: [],
        artifacts: []
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpACPClient({ baseUrl: "https://acp.example.com" });
    const run = await client.getRun("run-4");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acp.example.com/runs/run-4",
      expect.objectContaining({ method: "GET" })
    );
    expect(run?.id).toBe("run-4");
  });

  it("getRun() returns undefined on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({})
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpACPClient({ baseUrl: "https://acp.example.com" });
    const run = await client.getRun("missing-run");

    expect(run).toBeUndefined();
  });

  it("non-ok responses still throw for non-404 cases", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({})
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createHttpACPClient({ baseUrl: "https://acp.example.com" });
    await expect(client.getRun("run-err")).rejects.toThrow("ACP request failed: 500");
  });
});
