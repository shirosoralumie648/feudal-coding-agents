import { describe, expect, it } from "vitest";
import { scanExecutionArtifacts } from "./execution-scanner";

describe("execution scanner", () => {
  it("blocks eval in executor artifacts", () => {
    const report = scanExecutionArtifacts([
      {
        id: "artifact-1",
        content: 'const result = eval("x");'
      }
    ]);

    expect(report.blocked).toBe(true);
    expect(report.summary).toContain("Execution security scan blocked");
    expect(report.code.matches.some((match) => match.type === "eval")).toBe(true);
  });

  it("blocks high severity API key patterns", () => {
    const report = scanExecutionArtifacts([
      {
        id: "artifact-1",
        content: "api_key=abcdefghijklmnop1234567890"
      }
    ]);

    expect(report.blocked).toBe(true);
    expect(
      report.sensitiveInfo.matches.some((match) => match.type === "api_key")
    ).toBe(true);
  });

  it("preserves low severity diagnostics without blocking", () => {
    const report = scanExecutionArtifacts([
      {
        id: "artifact-1",
        content: "const value = Math.random();"
      }
    ]);

    expect(report.blocked).toBe(false);
    expect(report.summary).toContain("Execution security scan passed");
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "low",
        type: "math_random"
      })
    );
  });

  it("redacts sensitive values in diagnostics", () => {
    const secret = "api_key=abcdefghijklmnop1234567890";
    const report = scanExecutionArtifacts([
      {
        id: "artifact-1",
        content: secret
      }
    ]);

    expect(report.diagnostics.map((diagnostic) => diagnostic.context).join("\n")).toContain(
      "[REDACTED_API_KEY]"
    );
    expect(report.diagnostics.map((diagnostic) => diagnostic.context).join("\n")).not.toContain(
      secret
    );
  });
});
