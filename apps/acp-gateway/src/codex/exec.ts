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
  return execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024
  });
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
      await writeFile(outputPath, "", "utf8");

      try {
        await spawnImpl("codex", [
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

        return JSON.parse(await readFile(outputPath, "utf8")) as Record<
          string,
          unknown
        >;
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  };
}
