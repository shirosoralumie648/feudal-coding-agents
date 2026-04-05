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

  it("uses prompt markers to emit review verdicts for auditor and critic", async () => {
    const client = createMockACPClient();
    const auditorRun = await client.runAgent({
      agent: "auditor-agent",
      messages: [{ role: "user", content: "Review this change #mock:needs_revision" }]
    });
    const criticRun = await client.runAgent({
      agent: "critic-agent",
      messages: [{ role: "user", content: "Review this change #mock:reject" }]
    });

    expect(auditorRun.artifacts[0]?.content).toMatchObject({
      verdict: "needs_revision"
    });
    expect(criticRun.artifacts[0]?.content).toMatchObject({
      verdict: "reject"
    });
    expect(auditorRun.artifacts[0]?.content).toMatchObject({
      note: "auditor-agent requested revision before execution."
    });
    expect(criticRun.artifacts[0]?.content).toMatchObject({
      note: "critic-agent rejected the task plan."
    });
  });

  it("emits needs_revision once when marker is present without revision note", async () => {
    const client = createMockACPClient();
    const withoutRevisionNote = await client.runAgent({
      agent: "auditor-agent",
      messages: [{ role: "user", content: "Please review #mock:needs_revision-once" }]
    });
    const withRevisionNote = await client.runAgent({
      agent: "auditor-agent",
      messages: [
        {
          role: "user",
          content: "Please review #mock:needs_revision-once\nRevision note: addressed feedback"
        }
      ]
    });

    expect(withoutRevisionNote.artifacts[0]?.content).toMatchObject({
      verdict: "needs_revision"
    });
    expect(withRevisionNote.artifacts[0]?.content).toMatchObject({
      verdict: "approve"
    });
  });

  it("throws for unknown agent names instead of pretending verification succeeded", async () => {
    const client = createMockACPClient();

    await expect(
      client.runAgent({
        agent: "unknown-agent",
        messages: [{ role: "user", content: "Do something" }]
      })
    ).rejects.toThrow("Unknown mock ACP agent: unknown-agent");
  });
});
