import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CodexRunner, GatewayWorkerName } from "../workers/types";

const execFileAsync = promisify(execFile);

type SpawnResult = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
};

type SpawnImpl = (command: string, args: string[]) => Promise<SpawnResult | void>;

async function defaultSpawnImpl(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: 0
  };
}

export function createCodexExecRunner(options: {
  repoRoot: string;
  spawnImpl?: SpawnImpl;
}): CodexRunner {
  const spawnImpl = options.spawnImpl ?? defaultSpawnImpl;

  return {
    async run(input: {
      role: GatewayWorkerName;
      prompt: string;
      schema: Record<string, unknown>;
    }) {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "acp-gateway-codex-"));
      const schemaPath = path.join(tempDir, `${input.role}-schema.json`);
      const outputPath = path.join(tempDir, `${input.role}-output.json`);

      await writeFile(schemaPath, JSON.stringify(input.schema, null, 2), "utf8");

      try {
        const result = await spawnImpl("codex", [
          "exec",
          "--full-auto",
          "--skip-git-repo-check",
          "--cd",
          options.repoRoot,
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputPath,
          input.prompt
        ]);

        if (result?.exitCode && result.exitCode !== 0) {
          throw new Error(`codex exec failed with exit code ${result.exitCode}`);
        }

        const rawOutput = await readFile(outputPath, "utf8").catch(() => {
          throw new Error("codex exec did not produce output");
        });

        if (!rawOutput.trim()) {
          throw new Error("codex exec did not produce output");
        }

        try {
          return JSON.parse(rawOutput) as Record<string, unknown>;
        } catch {
          throw new Error("codex exec produced invalid JSON output");
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  };
}
