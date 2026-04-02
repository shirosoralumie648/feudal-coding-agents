import { describe, expect, it } from "vitest";
import { createMockACPClient } from "./mock-client";

describe("mock ACP client", () => {
  it("lists manifests for the feudal agents", async () => {
    const client = createMockACPClient();
    const manifests = await client.listAgents();

    expect(manifests.map((item) => item.name)).toContain("intake-agent");
    expect(manifests.map((item) => item.name)).toContain("gongbu-executor");
  });

  it("supports await and resume for approval checkpoints", async () => {
    const client = createMockACPClient();
    const awaiting = await client.awaitExternalInput({
      label: "approval",
      prompt: "Approve the task?",
      actions: ["approve", "reject"]
    });

    expect(awaiting.status).toBe("awaiting");

    const completed = await client.respondToAwait(awaiting.id, {
      role: "user",
      content: "approve"
    });

    expect(completed.status).toBe("completed");
  });
});
