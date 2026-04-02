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
});
