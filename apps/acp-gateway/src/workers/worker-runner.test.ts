import { describe, expect, it, vi } from "vitest";
import { createWorkerRunner } from "./worker-runner";

describe("worker runner", () => {
  it("turns analyst output into a decision-brief artifact", async () => {
    const codexRunner = {
      run: vi.fn().mockResolvedValue({ summary: "Plan and review the task." })
    };

    const runner = createWorkerRunner({ codexRunner });
    const result = await runner.runAgent({
      agent: "analyst-agent",
      messages: [{ role: "user", content: "Build the dashboard" }]
    });

    expect(codexRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "analyst-agent",
        prompt: expect.stringContaining("Build the dashboard")
      })
    );
    expect(result.status).toBe("completed");
    expect(result.artifacts[0]?.name).toBe("decision-brief.json");
    expect(result.artifacts[0]?.content).toEqual({
      summary: "Plan and review the task."
    });
  });

  it("rejects output that does not match the worker schema", async () => {
    const runner = createWorkerRunner({
      codexRunner: {
        run: vi.fn().mockResolvedValue({ summary: 42 })
      }
    });

    await expect(
      runner.runAgent({
        agent: "analyst-agent",
        messages: [{ role: "user", content: "Build the dashboard" }]
      })
    ).rejects.toThrow("Invalid analyst-agent output");
  });

  it("rejects output with extra properties when the schema is strict", async () => {
    const runner = createWorkerRunner({
      codexRunner: {
        run: vi
          .fn()
          .mockResolvedValue({ summary: "Plan and review the task.", extra: true })
      }
    });

    await expect(
      runner.runAgent({
        agent: "analyst-agent",
        messages: [{ role: "user", content: "Build the dashboard" }]
      })
    ).rejects.toThrow("Invalid analyst-agent output");
  });
});
