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
        role: "analyst-agent"
      })
    );
    expect(result.status).toBe("completed");
    expect(result.artifacts[0]?.name).toBe("decision-brief.json");
  });
});
