import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCodexExecRunner } from "./exec";

describe("codex exec runner", () => {
  it("builds a codex exec command with output schema and repository root", async () => {
    let capturedSchema: unknown;
    let tempDir: string | undefined;

    const spawnMock = vi.fn(async (_command: string, args: string[]) => {
      const schemaPath = args[args.indexOf("--output-schema") + 1];
      const outputPath = args[args.indexOf("--output-last-message") + 1];

      tempDir = path.dirname(schemaPath);
      capturedSchema = JSON.parse(await readFile(schemaPath, "utf8"));
      await writeFile(outputPath, JSON.stringify({ summary: "ok" }), "utf8");

      return { exitCode: 0 };
    });

    const runner = createCodexExecRunner({
      repoRoot: "/repo",
      spawnImpl: spawnMock
    });

    const result = await runner.run({
      role: "analyst-agent",
      prompt: "Return a decision brief as JSON.",
      schema: {
        type: "object",
        required: ["summary"]
      }
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining([
        "exec",
        "--full-auto",
        "--skip-git-repo-check",
        "--cd",
        "/repo",
        "--output-schema",
        "--output-last-message"
      ])
    );
    expect(capturedSchema).toEqual({
      type: "object",
      required: ["summary"]
    });
    expect(result).toEqual({ summary: "ok" });
    await expect(access(tempDir!)).rejects.toThrow();
  });

  it("fails fast on non-zero exit codes and still cleans up temp files", async () => {
    let tempDir: string | undefined;

    const spawnMock = vi.fn(async (_command: string, args: string[]) => {
      const schemaPath = args[args.indexOf("--output-schema") + 1];
      tempDir = path.dirname(schemaPath);
      return { exitCode: 17, stderr: "boom" };
    });

    const runner = createCodexExecRunner({
      repoRoot: "/repo",
      spawnImpl: spawnMock
    });

    await expect(
      runner.run({
        role: "analyst-agent",
        prompt: "Return a decision brief as JSON.",
        schema: {
          type: "object",
          required: ["summary"]
        }
      })
    ).rejects.toThrow("codex exec failed with exit code 17");

    await expect(access(tempDir!)).rejects.toThrow();
  });
});
