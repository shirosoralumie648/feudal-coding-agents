# Codex Feudal Cluster Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock ACP execution layer with a real local ACP gateway backed by Codex CLI workers, then surface real run state and approval data in the control plane and web console.

**Architecture:** Keep `apps/control-plane` authoritative for task state, add a new `apps/acp-gateway` HTTP service for ACP-compatible discovery and run management, and refactor `packages/acp` into a reusable transport layer with both mock and HTTP clients. Web UI work should stay incremental: reuse the existing shell, but show real ACP run ids, awaiting prompts, and resume actions.

**Tech Stack:** TypeScript, Fastify, React, Vitest, Zod, local `codex exec`, `pnpm` workspaces

---

## File Structure

### Shared Contracts And ACP Transport
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `packages/acp/src/index.ts`
- Create: `packages/acp/src/http-client.ts`
- Create: `packages/acp/src/http-client.test.ts`
- Modify: `packages/acp/src/mock-client.ts`
- Modify: `packages/acp/src/mock-client.test.ts`
- Modify: `packages/acp/package.json`

### ACP Gateway
- Create: `apps/acp-gateway/package.json`
- Create: `apps/acp-gateway/src/server.ts`
- Create: `apps/acp-gateway/src/manifests.ts`
- Create: `apps/acp-gateway/src/store.ts`
- Create: `apps/acp-gateway/src/routes/agents.ts`
- Create: `apps/acp-gateway/src/routes/runs.ts`
- Create: `apps/acp-gateway/src/routes/runs.test.ts`

### Codex Worker Adapter
- Create: `apps/acp-gateway/src/codex/exec.ts`
- Create: `apps/acp-gateway/src/codex/exec.test.ts`
- Create: `apps/acp-gateway/src/workers/types.ts`
- Create: `apps/acp-gateway/src/workers/json-schemas.ts`
- Create: `apps/acp-gateway/src/workers/prompt-templates.ts`
- Create: `apps/acp-gateway/src/workers/registry.ts`
- Create: `apps/acp-gateway/src/workers/worker-runner.ts`
- Create: `apps/acp-gateway/src/workers/worker-runner.test.ts`

### Control Plane Integration
- Create: `apps/control-plane/src/config.ts`
- Modify: `apps/control-plane/src/store.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
- Modify: `apps/control-plane/src/routes/agents.ts`
- Modify: `apps/control-plane/src/server.ts`

### Web Console
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/components/new-task-panel.tsx`
- Create: `apps/web/src/components/task-detail-panel.tsx`
- Create: `apps/web/src/components/approval-inbox-panel.tsx`
- Create: `apps/web/src/components/agent-registry-panel.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/styles.css`

### Full-Stack Workflow
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/acp-gateway/src/smoke.test.ts`

## Task 1: Extend Shared Contracts And ACP Transport

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/index.test.ts`
- Modify: `packages/acp/src/index.ts`
- Create: `packages/acp/src/http-client.ts`
- Test: `packages/acp/src/http-client.test.ts`
- Modify: `packages/acp/src/mock-client.ts`
- Modify: `packages/acp/src/mock-client.test.ts`
- Modify: `packages/acp/package.json`

- [ ] **Step 1: Write the failing contract test for run summaries and approval metadata**

```ts
import { describe, expect, it } from "vitest";
import { TaskRecordSchema } from "./index";

describe("contracts", () => {
  it("accepts task records with ACP run summaries and approval metadata", () => {
    const parsed = TaskRecordSchema.parse({
      id: "task-1",
      title: "Build dashboard",
      prompt: "Create dashboard",
      status: "awaiting_approval",
      artifacts: [],
      history: [],
      runIds: ["run-1"],
      runs: [
        {
          id: "run-1",
          agent: "analyst-agent",
          status: "awaiting",
          phase: "review",
          awaitPrompt: "Approve the decision brief?",
          allowedActions: ["approve", "reject"]
        }
      ],
      approvalRunId: "run-1",
      approvalRequest: {
        runId: "run-1",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"]
      },
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    });

    expect(parsed.runs[0]?.status).toBe("awaiting");
    expect(parsed.approvalRequest?.actions).toContain("approve");
  });
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `pnpm exec vitest run packages/contracts/src/index.test.ts`

Expected: FAIL because `runs` and `approvalRequest` are not yet defined on `TaskRecordSchema`

- [ ] **Step 3: Implement the minimal contract additions**

```ts
export const ACPRunStatusSchema = z.enum([
  "created",
  "in-progress",
  "awaiting",
  "completed",
  "failed",
  "cancelling",
  "cancelled"
]);

export const ACPRunPhaseSchema = z.enum([
  "intake",
  "planning",
  "review",
  "approval",
  "execution",
  "verification"
]);

export const ACPRunSummarySchema = z.object({
  id: z.string(),
  agent: z.string(),
  status: ACPRunStatusSchema,
  phase: ACPRunPhaseSchema,
  awaitPrompt: z.string().optional(),
  allowedActions: z.array(z.string()).optional()
});

export const TaskApprovalRequestSchema = z.object({
  runId: z.string(),
  prompt: z.string(),
  actions: z.array(z.string())
});

export const TaskRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  artifacts: z.array(TaskArtifactSchema),
  history: z.array(TaskHistoryEntrySchema),
  runIds: z.array(z.string()),
  runs: z.array(ACPRunSummarySchema).default([]),
  approvalRunId: z.string().optional(),
  approvalRequest: TaskApprovalRequestSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type ACPRunSummary = z.infer<typeof ACPRunSummarySchema>;
export type TaskApprovalRequest = z.infer<typeof TaskApprovalRequestSchema>;
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `pnpm exec vitest run packages/contracts/src/index.test.ts`

Expected: PASS

- [ ] **Step 5: Write the failing HTTP ACP client test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpACPClient } from "./http-client";

describe("http ACP client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers agents and resumes awaiting runs over HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.endsWith("/agents")) {
          return Promise.resolve(Response.json([{ name: "intake-agent", role: "宰相府", description: "Intake", capabilities: ["taskspec"] }]));
        }

        if (url.endsWith("/runs/run-1") && init?.method === "POST") {
          return Promise.resolve(Response.json({ id: "run-1", agent: "approval-gate", status: "completed", messages: [], artifacts: [] }));
        }

        throw new Error(`unexpected request: ${url}`);
      })
    );

    const client = createHttpACPClient({ baseUrl: "http://127.0.0.1:4100" });
    const agents = await client.listAgents();
    const resumed = await client.respondToAwait("run-1", { role: "user", content: "approve" });

    expect(agents[0]?.name).toBe("intake-agent");
    expect(resumed.status).toBe("completed");
  });
});
```

- [ ] **Step 6: Run the ACP package tests to verify the new test fails**

Run: `pnpm exec vitest run packages/acp/src/mock-client.test.ts packages/acp/src/http-client.test.ts`

Expected: FAIL because `http-client.ts` does not exist yet

- [ ] **Step 7: Implement the HTTP client and update package exports**

```ts
export function createHttpACPClient(options: { baseUrl: string }): ACPClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, init);

    if (!response.ok) {
      throw new Error(`ACP request failed: ${response.status} ${path}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    listAgents: () => request("/agents"),
    runAgent: (input) =>
      request("/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "agent-run", ...input })
      }),
    awaitExternalInput: (input) =>
      request("/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "await", ...input })
      }),
    respondToAwait: (runId, response) =>
      request(`/runs/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(response)
      }),
    getRun: (runId) => request(`/runs/${runId}`)
  };
}
```

- [ ] **Step 8: Run the ACP package tests to verify they pass**

Run: `pnpm exec vitest run packages/acp/src/mock-client.test.ts packages/acp/src/http-client.test.ts`

Expected: PASS

- [ ] **Step 9: Commit the shared transport layer**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts packages/acp/src/index.ts packages/acp/src/http-client.ts packages/acp/src/http-client.test.ts packages/acp/src/mock-client.ts packages/acp/src/mock-client.test.ts packages/acp/package.json
git commit -m "Add ACP HTTP transport and run contracts"
```

## Task 2: Add ACP Gateway Discovery And Run Endpoints

**Files:**
- Create: `apps/acp-gateway/package.json`
- Create: `apps/acp-gateway/src/server.ts`
- Create: `apps/acp-gateway/src/manifests.ts`
- Create: `apps/acp-gateway/src/store.ts`
- Create: `apps/acp-gateway/src/routes/agents.ts`
- Create: `apps/acp-gateway/src/routes/runs.ts`
- Test: `apps/acp-gateway/src/routes/runs.test.ts`

- [ ] **Step 1: Write the failing gateway route test**

```ts
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerAgentRoutes } from "./agents";
import { registerRunRoutes } from "./runs";

describe("ACP gateway routes", () => {
  it("lists manifests, polls an awaiting run, and resumes it", async () => {
    const app = Fastify();
    registerAgentRoutes(app);
    registerRunRoutes(app);

    const agents = await app.inject({ method: "GET", url: "/agents" });
    const created = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        kind: "await",
        label: "approval-gate",
        prompt: "Approve the decision brief?",
        actions: ["approve", "reject"]
      }
    });
    const runId = created.json().id;
    const fetched = await app.inject({ method: "GET", url: `/runs/${runId}` });
    const resumed = await app.inject({
      method: "POST",
      url: `/runs/${runId}`,
      payload: {
        role: "user",
        content: "approve"
      }
    });

    expect(agents.statusCode).toBe(200);
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe("awaiting");
    expect(fetched.json().id).toBe(runId);
    expect(resumed.json().status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run the gateway test to verify it fails**

Run: `pnpm exec vitest run apps/acp-gateway/src/routes/runs.test.ts`

Expected: FAIL because `apps/acp-gateway` files do not exist yet

- [ ] **Step 3: Add the gateway package and in-memory run store**

```ts
export interface GatewayRunRecord {
  id: string;
  agent: string;
  status:
    | "created"
    | "in-progress"
    | "awaiting"
    | "completed"
    | "failed"
    | "cancelling"
    | "cancelled";
  messages: ACPMessage[];
  artifacts: ACPArtifact[];
  awaitPrompt?: string;
  allowedActions?: string[];
}

export class GatewayStore {
  private readonly runs = new Map<string, GatewayRunRecord>();

  listAgents() {
    return manifests;
  }

  saveRun(run: GatewayRunRecord) {
    this.runs.set(run.id, run);
    return run;
  }

  getRun(runId: string) {
    return this.runs.get(runId);
  }
}
```

- [ ] **Step 4: Implement `/agents`, `/runs`, `/runs/:runId`, and `/runs/:runId` resume routes**

```ts
const RunCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("await"),
    label: z.string(),
    prompt: z.string(),
    actions: z.array(z.string()).min(1)
  }),
  z.object({
    kind: z.literal("agent-run"),
    agent: z.string(),
    messages: z.array(z.object({ role: z.string(), content: z.string() }))
  })
]);

const AwaitResponseSchema = z.object({
  role: z.literal("user"),
  content: z.string().min(1)
});

export function registerRunRoutes(
  app: FastifyInstance,
  options?: {
    store?: GatewayStore;
    runAgent?: (payload: Extract<z.infer<typeof RunCreateSchema>, { kind: "agent-run" }>) => Promise<GatewayRunRecord>;
  }
) {
  const store = options?.store ?? new GatewayStore();

  app.post("/runs", async (request, reply) => {
    const payload = RunCreateSchema.parse(request.body);

    if (payload.kind === "await") {
      const run = store.saveRun({
        id: crypto.randomUUID(),
        agent: payload.label,
        status: "awaiting",
        messages: [],
        artifacts: [],
        awaitPrompt: payload.prompt,
        allowedActions: payload.actions
      });

      return reply.code(201).send(run);
    }

    if (!options?.runAgent) {
      return reply.code(400).send({ message: "Unsupported run kind: agent-run" });
    }

    const run = await options.runAgent(payload);
    store.saveRun(run);
    return reply.code(201).send(run);
  });

  app.get("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const run = store.getRun(params.runId);

    if (!run) {
      return reply.code(404).send({ message: "Run not found" });
    }

    return run;
  });

  app.post("/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const response = AwaitResponseSchema.parse(request.body);
    const run = store.getRun(params.runId);

    if (!run || run.status !== "awaiting") {
      return reply.code(409).send({ message: "Run is not awaiting input" });
    }

    if (run.allowedActions && !run.allowedActions.includes(response.content)) {
      return reply.code(400).send({ message: `Unsupported approval action: ${response.content}` });
    }

    const resumed = store.saveRun({
      ...run,
      status: "completed",
      messages: [...run.messages, response]
    });

    return resumed;
  });
}
```

- [ ] **Step 5: Run the gateway test to verify it passes**

Run: `pnpm exec vitest run apps/acp-gateway/src/routes/runs.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the gateway skeleton**

```bash
git add apps/acp-gateway/package.json apps/acp-gateway/src/server.ts apps/acp-gateway/src/manifests.ts apps/acp-gateway/src/store.ts apps/acp-gateway/src/routes/agents.ts apps/acp-gateway/src/routes/runs.ts apps/acp-gateway/src/routes/runs.test.ts
git commit -m "Add ACP gateway discovery and run routes"
```

## Task 3: Add The Codex Worker Adapter And Role Registry

**Files:**
- Create: `apps/acp-gateway/src/codex/exec.ts`
- Test: `apps/acp-gateway/src/codex/exec.test.ts`
- Create: `apps/acp-gateway/src/workers/types.ts`
- Create: `apps/acp-gateway/src/workers/json-schemas.ts`
- Create: `apps/acp-gateway/src/workers/prompt-templates.ts`
- Create: `apps/acp-gateway/src/workers/registry.ts`
- Create: `apps/acp-gateway/src/workers/worker-runner.ts`
- Test: `apps/acp-gateway/src/workers/worker-runner.test.ts`
- Modify: `apps/acp-gateway/src/routes/runs.ts`

- [ ] **Step 1: Write the failing Codex runner test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createCodexExecRunner } from "./exec";

describe("codex exec runner", () => {
  it("builds a codex exec command with output schema and repository root", async () => {
    const spawnMock = vi.fn().mockResolvedValue({
      code: 0,
      stdout: "{\"summary\":\"ok\"}"
    });

    const runner = createCodexExecRunner({
      repoRoot: "/repo",
      spawnImpl: spawnMock
    });

    await runner.run({
      role: "analyst-agent",
      prompt: "Return a decision brief as JSON.",
      schema: { type: "object", required: ["summary"] }
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["exec", "--cd", "/repo"])
    );
  });
});
```

- [ ] **Step 2: Run the Codex runner test to verify it fails**

Run: `pnpm exec vitest run apps/acp-gateway/src/codex/exec.test.ts`

Expected: FAIL because `createCodexExecRunner` does not exist yet

- [ ] **Step 3: Implement the Codex runner and schema-backed execution**

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

async function writeJsonTemp(prefix: string, filename: string, value: unknown) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const filePath = path.join(tempDir, filename);
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  return {
    filePath,
    cleanup: () => rm(tempDir, { recursive: true, force: true })
  };
}

async function readJsonFile(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

export function createCodexExecRunner(options: {
  repoRoot: string;
  spawnImpl?: typeof execa;
}) {
  const spawnImpl = options.spawnImpl ?? execa;

  return {
    async run(input: { role: string; prompt: string; schema: Record<string, unknown> }) {
      const schemaFile = await writeJsonTemp("codex-schema", "schema.json", input.schema);
      const outputFile = await writeJsonTemp("codex-output", "result.json", {});

      try {
        await spawnImpl("codex", [
          "exec",
          "--full-auto",
          "--skip-git-repo-check",
          "--cd",
          options.repoRoot,
          "--output-schema",
          schemaFile.filePath,
          "--output-last-message",
          outputFile.filePath,
          input.prompt
        ]);

        return readJsonFile(outputFile.filePath);
      } finally {
        await Promise.all([schemaFile.cleanup(), outputFile.cleanup()]);
      }
    }
  };
}
```

- [ ] **Step 4: Write the failing worker registry test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createWorkerRunner } from "./worker-runner";

describe("worker runner", () => {
  it("turns analyst output into a decision-brief artifact", async () => {
    const runner = createWorkerRunner({
      codexRunner: {
        run: vi.fn().mockResolvedValue({ summary: "Plan and review the task." })
      }
    });

    const result = await runner.runAgent({
      agent: "analyst-agent",
      messages: [{ role: "user", content: "Build the dashboard" }]
    });

    expect(result.artifacts[0]?.name).toBe("decision-brief.json");
    expect(result.status).toBe("completed");
  });
});
```

- [ ] **Step 5: Run the worker tests to verify they fail**

Run: `pnpm exec vitest run apps/acp-gateway/src/codex/exec.test.ts apps/acp-gateway/src/workers/worker-runner.test.ts`

Expected: FAIL because the worker registry and artifact mapping do not exist yet

- [ ] **Step 6: Implement prompt templates, output schemas, and worker registry**

```ts
const intakeOutputSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    prompt: { type: "string" }
  },
  required: ["title", "prompt"],
  additionalProperties: false
} as const;

const decisionBriefSchema = {
  type: "object",
  properties: {
    summary: { type: "string" }
  },
  required: ["summary"],
  additionalProperties: false
} as const;

const reviewSchema = {
  type: "object",
  properties: {
    verdict: { type: "string" },
    note: { type: "string" }
  },
  required: ["verdict", "note"],
  additionalProperties: false
} as const;

const executionReportSchema = {
  type: "object",
  properties: {
    result: { type: "string" },
    output: { type: "string" },
    blockingIssues: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["result", "output"],
  additionalProperties: false
} as const;

function renderIntakePrompt(input: string) {
  return `Normalize this task into a concise JSON taskspec.\n\n${input}`;
}

function renderAnalystPrompt(input: string) {
  return `Produce a decision brief as JSON.\n\n${input}`;
}

function renderAuditorPrompt(input: string) {
  return `Review this plan for consistency and risk. Return JSON only.\n\n${input}`;
}

function renderCriticPrompt(input: string) {
  return `Act as an adversarial reviewer. Return JSON only.\n\n${input}`;
}

function renderExecutorPrompt(input: string) {
  return `Execute the approved assignment and summarize the result as JSON.\n\n${input}`;
}

function renderVerifierPrompt(input: string) {
  return `Verify the execution report and return JSON.\n\n${input}`;
}

const workerRegistry = {
  "intake-agent": {
    artifactName: "taskspec.json",
    outputSchema: intakeOutputSchema,
    buildPrompt: (messages: ACPMessage[]) =>
      renderIntakePrompt(messages.at(-1)?.content ?? "")
  },
  "analyst-agent": {
    artifactName: "decision-brief.json",
    outputSchema: decisionBriefSchema,
    buildPrompt: (messages: ACPMessage[]) =>
      renderAnalystPrompt(messages.at(-1)?.content ?? "")
  },
  "auditor-agent": {
    artifactName: "review.json",
    outputSchema: reviewSchema,
    buildPrompt: (messages: ACPMessage[]) =>
      renderAuditorPrompt(messages.at(-1)?.content ?? "")
  },
  "critic-agent": {
    artifactName: "review.json",
    outputSchema: reviewSchema,
    buildPrompt: (messages: ACPMessage[]) =>
      renderCriticPrompt(messages.at(-1)?.content ?? "")
  },
  "gongbu-executor": {
    artifactName: "execution-report.json",
    outputSchema: executionReportSchema,
    buildPrompt: (messages: ACPMessage[]) =>
      renderExecutorPrompt(messages.at(-1)?.content ?? "")
  },
  "xingbu-verifier": {
    artifactName: "execution-report.json",
    outputSchema: executionReportSchema,
    buildPrompt: (messages: ACPMessage[]) =>
      renderVerifierPrompt(messages.at(-1)?.content ?? "")
  }
} as const;

export type GatewayWorkerName = keyof typeof workerRegistry;

export interface CodexRunner {
  run(input: {
    role: GatewayWorkerName;
    prompt: string;
    schema: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

export function createWorkerRunner(options: { codexRunner: CodexRunner }) {
  return {
    async runAgent(input: { agent: GatewayWorkerName; messages: ACPMessage[] }) {
      const definition = workerRegistry[input.agent];
      const payload = await options.codexRunner.run({
        role: input.agent,
        prompt: definition.buildPrompt(input.messages),
        schema: definition.outputSchema
      });

      return {
        id: crypto.randomUUID(),
        agent: input.agent,
        status: "completed",
        messages: input.messages,
        artifacts: [
          {
            id: crypto.randomUUID(),
            name: definition.artifactName,
            mimeType: "application/json",
            content: payload
          }
        ]
      };
    }
  };
}
```

- [ ] **Step 7: Wire the gateway `POST /runs` route to real workers**

```ts
registerRunRoutes(app, {
  store,
  runAgent: (payload) =>
    workerRunner.runAgent({
      agent: payload.agent as GatewayWorkerName,
      messages: payload.messages
    })
});
```

- [ ] **Step 8: Run the worker and gateway tests to verify they pass**

Run: `pnpm exec vitest run apps/acp-gateway/src/codex/exec.test.ts apps/acp-gateway/src/workers/worker-runner.test.ts apps/acp-gateway/src/routes/runs.test.ts`

Expected: PASS

- [ ] **Step 9: Commit the real worker adapter**

```bash
git add apps/acp-gateway/src/codex/exec.ts apps/acp-gateway/src/codex/exec.test.ts apps/acp-gateway/src/workers/types.ts apps/acp-gateway/src/workers/json-schemas.ts apps/acp-gateway/src/workers/prompt-templates.ts apps/acp-gateway/src/workers/registry.ts apps/acp-gateway/src/workers/worker-runner.ts apps/acp-gateway/src/workers/worker-runner.test.ts apps/acp-gateway/src/routes/runs.ts
git commit -m "Add Codex-backed ACP worker execution"
```

## Task 4: Refactor The Control Plane To Use Real ACP Runs

**Files:**
- Create: `apps/control-plane/src/config.ts`
- Modify: `apps/control-plane/src/store.ts`
- Modify: `apps/control-plane/src/services/orchestrator-service.ts`
- Modify: `apps/control-plane/src/routes/tasks.ts`
- Modify: `apps/control-plane/src/routes/tasks.test.ts`
- Modify: `apps/control-plane/src/routes/agents.ts`
- Modify: `apps/control-plane/src/server.ts`

- [ ] **Step 1: Write the failing control-plane route test for real run metadata**

```ts
it("returns ACP run summaries and approval prompt data on task creation", async () => {
  const service = createOrchestratorService({
    acpClient: createMockACPClient()
  });
  const app = Fastify();
  registerAgentRoutes(app, service);
  registerTaskRoutes(app, service);

  const response = await app.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    }
  });

  expect(response.statusCode).toBe(201);
  expect(response.json().runs.length).toBeGreaterThan(0);
  expect(response.json().approvalRequest.prompt).toContain("Approve");
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts`

Expected: FAIL because `TaskRecord` does not yet expose `runs` and `approvalRequest` from the service layer

- [ ] **Step 3: Replace the module-level mock client with a configurable service factory**

```ts
function toRunSummary(
  run: ACPRun,
  phase: ACPRunSummary["phase"]
): ACPRunSummary {
  return {
    id: run.id,
    agent: run.agent,
    status: run.status,
    phase,
    awaitPrompt: run.awaitPrompt,
    allowedActions: run.allowedActions
  };
}

function newTask(spec: TaskSpec): TaskRecord {
  const now = new Date().toISOString();

  return {
    id: spec.id,
    title: spec.title,
    prompt: spec.prompt,
    status: "draft",
    artifacts: [],
    history: [],
    runIds: [],
    runs: [],
    createdAt: now,
    updatedAt: now
  };
}

export function createOrchestratorService(options: {
  acpClient: ACPClient;
  store?: MemoryStore;
}) {
  const acp = options.acpClient;
  const store = options.store ?? new MemoryStore();

  return {
    async createTask(spec: TaskSpec) {
      let task = transitionTask(newTask(spec), { type: "task.submitted" });
      const intakeRun = await acp.runAgent({
        agent: "intake-agent",
        messages: [{ role: "user", content: spec.prompt }]
      });
      task = transitionTask(task, { type: "intake.completed" });

      const analystRun = await acp.runAgent({
        agent: "analyst-agent",
        messages: [
          {
            role: "agent/intake-agent",
            content: JSON.stringify(intakeRun.artifacts[0]?.content)
          }
        ]
      });

      return store.saveTask(transitionTask(task, { type: "planning.completed" }));
    },
    async approveTask(taskId: string) {
      const current = store.getTask(taskId);

      if (!current || !current.approvalRunId) {
        throw new Error(`Task ${taskId} is not awaiting approval`);
      }

      return current;
    },
    listTasks: () => store.listTasks(),
    getTask: (taskId: string) => store.getTask(taskId),
    listAgents: () => acp.listAgents()
  };
}
```

- [ ] **Step 4: Add environment-backed ACP client selection in `config.ts`**

```ts
export function createACPClientFromEnv() {
  const baseUrl = process.env.ACP_BASE_URL ?? "http://127.0.0.1:4100";
  const mode = process.env.FEUDAL_ACP_MODE ?? "http";

  if (mode === "mock") {
    return createMockACPClient();
  }

  return createHttpACPClient({ baseUrl });
}

export const defaultOrchestratorService = createOrchestratorService({
  acpClient: createACPClientFromEnv()
});

export function registerAgentRoutes(
  app: FastifyInstance,
  service = defaultOrchestratorService
) {
  app.get("/api/agents", async () => service.listAgents());
}

export function registerTaskRoutes(
  app: FastifyInstance,
  service = defaultOrchestratorService
) {
  app.get("/api/tasks", async () => service.listTasks());
  app.get("/api/tasks/:taskId", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = service.getTask(params.taskId);

    if (!task) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return task;
  });
  app.post("/api/tasks", async (request, reply) => {
    const payload = TaskSpecSchema.parse({
      id: crypto.randomUUID(),
      ...request.body
    });
    return reply.code(201).send(await service.createTask(payload));
  });
  app.post("/api/tasks/:taskId/approve", async (request, reply) => {
    const params = z.object({ taskId: z.string() }).parse(request.params);
    const task = service.getTask(params.taskId);

    if (!task) {
      return reply.code(404).send({ message: "Task not found" });
    }

    return service.approveTask(params.taskId);
  });
}
```

- [ ] **Step 5: Persist run summaries and approval data in the task store**

```ts
task = {
  ...task,
  runIds: [...task.runIds, intakeRun.id, analystRun.id, auditorRun.id, criticRun.id, approvalRun.id],
  runs: [
    ...task.runs,
    toRunSummary(intakeRun, "intake"),
    toRunSummary(analystRun, "planning"),
    toRunSummary(auditorRun, "review"),
    toRunSummary(criticRun, "review"),
    toRunSummary(approvalRun, "approval")
  ],
  approvalRunId: approvalRun.id,
  approvalRequest: {
    runId: approvalRun.id,
    prompt: approvalRun.awaitPrompt ?? "Approve the decision brief?",
    actions: approvalRun.allowedActions ?? ["approve", "reject"]
  },
  updatedAt: new Date().toISOString()
};

return store.saveTask(task);
```

- [ ] **Step 6: Resume the real awaiting run during approval**

```ts
const resumed = await acp.respondToAwait(current.approvalRunId, {
  role: "user",
  content: "approve"
});

async function runExecutorWithSingleRetry() {
  try {
    return await acp.runAgent({
      agent: "gongbu-executor",
      messages: [{ role: "user", content: current.prompt }]
    });
  } catch (error) {
    return acp.runAgent({
      agent: "gongbu-executor",
      messages: [{ role: "user", content: current.prompt }]
    });
  }
}

let task = transitionTask(current, { type: "approval.granted" });
let executorRun: ACPRun;

try {
  executorRun = await runExecutorWithSingleRetry();
} catch (error) {
  return store.saveTask(transitionTask(task, { type: "execution.failed" }));
}

task = transitionTask(task, { type: "dispatch.completed" });
task = transitionTask(task, { type: "execution.completed" });

const verifierRun = await acp.runAgent({
  agent: "xingbu-verifier",
  messages: [
    {
      role: "agent/gongbu-executor",
      content: JSON.stringify(executorRun.artifacts[0]?.content)
    }
  ]
});

const verifierContent = verifierRun.artifacts[0]?.content as {
  result?: string;
  blockingIssues?: string[];
};

task =
  verifierContent.blockingIssues && verifierContent.blockingIssues.length > 0
    ? transitionTask(task, { type: "verification.failed" })
    : verifierContent.result === "verified"
      ? transitionTask(task, { type: "verification.passed" })
      : transitionTask(task, { type: "verification.partial" });

task = {
  ...task,
  approvalRunId: undefined,
  approvalRequest: undefined,
  runIds: [...task.runIds, executorRun.id, verifierRun.id],
  runs: task.runs.map((run) =>
    run.id === resumed.id ? toRunSummary(resumed, "approval") : run
  ).concat([
    toRunSummary(executorRun, "execution"),
    toRunSummary(verifierRun, "verification")
  ]),
  artifacts: [
    ...task.artifacts,
    {
      id: executorRun.id,
      kind: "execution-report",
      name: "execution-report.json",
      mimeType: "application/json",
      content: executorRun.artifacts[0]?.content
    },
    {
      id: verifierRun.id,
      kind: "execution-report",
      name: "execution-report.json",
      mimeType: "application/json",
      content: verifierRun.artifacts[0]?.content
    }
  ]
};

return store.saveTask(task);
```

- [ ] **Step 7: Run the control-plane route tests to verify they pass**

Run: `pnpm exec vitest run apps/control-plane/src/routes/tasks.test.ts`

Expected: PASS

- [ ] **Step 8: Commit the control-plane integration**

```bash
git add apps/control-plane/src/config.ts apps/control-plane/src/store.ts apps/control-plane/src/services/orchestrator-service.ts apps/control-plane/src/routes/tasks.ts apps/control-plane/src/routes/tasks.test.ts apps/control-plane/src/routes/agents.ts apps/control-plane/src/server.ts
git commit -m "Integrate control plane with ACP gateway"
```

## Task 5: Upgrade The Web Console For Real ACP Run Data

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/components/new-task-panel.tsx`
- Create: `apps/web/src/components/task-detail-panel.tsx`
- Create: `apps/web/src/components/approval-inbox-panel.tsx`
- Create: `apps/web/src/components/agent-registry-panel.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write the failing UI test for run ids and awaiting prompt**

```tsx
it("shows ACP run details and approval prompt from the selected task", async () => {
  render(<App />);

  expect(await screen.findByText("Run run-1")).toBeVisible();
  expect(screen.getByText("Approve the decision brief?")).toBeVisible();
  expect(screen.getByRole("button", { name: "Approve Build dashboard" })).toBeVisible();
});
```

- [ ] **Step 2: Run the web test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/app.test.tsx`

Expected: FAIL because the current UI does not render run summaries or approval prompts

- [ ] **Step 3: Extract API calls into a focused client**

```ts
export interface CreateTaskInput {
  title: string;
  prompt: string;
  allowMock: boolean;
  requiresApproval: boolean;
  sensitivity: "low" | "medium" | "high";
}

export async function fetchTasks() {
  return requestJson<TaskRecord[]>("/api/tasks");
}

export async function fetchAgents() {
  return requestJson<ACPAgentManifest[]>("/api/agents");
}

export async function createTask(payload: CreateTaskInput) {
  return requestJson<TaskRecord>("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function approveTask(taskId: string) {
  return requestJson<TaskRecord>(`/api/tasks/${taskId}/approve`, {
    method: "POST"
  });
}
```

- [ ] **Step 4: Split `app.tsx` into focused panels before adding more state**

```tsx
<NewTaskPanel draft={draft} isSubmitting={isSubmitting} onSubmit={handleTaskSubmit} onChange={handleDraftChange} />
<TaskDetailPanel selectedTask={selectedTask} laneLabels={laneLabels} />
<ApprovalInboxPanel tasks={awaitingTasks} activeApprovalId={activeApprovalId} onApprove={handleApprove} />
<AgentRegistryPanel agents={agents} />
```

- [ ] **Step 5: Render run summaries and approval prompt in the task detail and inbox panels**

```tsx
{selectedTask.runs.map((run) => (
  <li key={run.id}>
    <strong>{`Run ${run.id}`}</strong>
    <span>{`${run.agent} / ${run.status} / ${run.phase}`}</span>
  </li>
))}

{selectedTask.approvalRequest ? (
  <article>
    <h3>Approval Gate</h3>
    <p>{selectedTask.approvalRequest.prompt}</p>
    <small>{selectedTask.approvalRequest.actions.join(" / ")}</small>
  </article>
) : null}
```

- [ ] **Step 6: Run the web tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/app.test.tsx`

Expected: PASS

- [ ] **Step 7: Commit the UI upgrades**

```bash
git add apps/web/src/lib/api.ts apps/web/src/components/new-task-panel.tsx apps/web/src/components/task-detail-panel.tsx apps/web/src/components/approval-inbox-panel.tsx apps/web/src/components/agent-registry-panel.tsx apps/web/src/app.tsx apps/web/src/app.test.tsx apps/web/src/styles.css
git commit -m "Show real ACP run state in web console"
```

## Task 6: Add Full-Stack Dev Wiring And A Local Smoke Path

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/acp-gateway/src/smoke.test.ts`
- Modify: `apps/acp-gateway/src/server.ts`
- Modify: `apps/control-plane/src/server.ts`

- [ ] **Step 1: Write the failing smoke test for the real collaboration path**

```ts
import { describe, expect, it } from "vitest";

describe("phase 2 smoke flow", () => {
  it("creates, approves, executes, and verifies through the gateway", async () => {
    const result = await runSmokeScenario();

    expect(result.created.status).toBe("awaiting_approval");
    expect(result.approved.status).toBe("completed");
    expect(result.approved.artifacts.map((artifact) => artifact.name)).toContain("execution-report.json");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `pnpm exec vitest run apps/acp-gateway/src/smoke.test.ts`

Expected: FAIL because the smoke harness and gateway boot path do not exist yet

- [ ] **Step 3: Add gateway and control-plane dev scripts to the workspace**

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter @feudal/acp-gateway --filter @feudal/control-plane --filter @feudal/web dev",
    "test": "pnpm exec vitest run --config vitest.config.ts",
    "build": "pnpm --filter @feudal/web build"
  }
}
```

- [ ] **Step 4: Build the smoke harness with a stub Codex runner**

```ts
import Fastify from "fastify";
import { vi } from "vitest";
import { createHttpACPClient } from "@feudal/acp/http-client";
import { createOrchestratorService } from "../../control-plane/src/services/orchestrator-service";
import { registerAgentRoutes as registerControlPlaneAgentRoutes } from "../../control-plane/src/routes/agents";
import { registerTaskRoutes } from "../../control-plane/src/routes/tasks";
import { registerAgentRoutes as registerGatewayAgentRoutes } from "./routes/agents";
import { registerRunRoutes } from "./routes/runs";
import { GatewayStore } from "./store";
import { createWorkerRunner, type GatewayWorkerName } from "./workers/worker-runner";

export async function runSmokeScenario() {
  const codexRunner = {
    run: vi
      .fn()
      .mockResolvedValueOnce({ title: "Build dashboard", prompt: "Create dashboard" })
      .mockResolvedValueOnce({ summary: "Plan and review the task." })
      .mockResolvedValueOnce({ verdict: "approve", note: "No blocking issues." })
      .mockResolvedValueOnce({ verdict: "approve", note: "Looks good." })
      .mockResolvedValueOnce({ result: "completed", output: "Executor finished the work." })
      .mockResolvedValueOnce({ result: "verified", output: "Verifier accepted the work." })
  };

  const workerRunner = createWorkerRunner({ codexRunner });
  const gateway = Fastify({ logger: false });
  registerGatewayAgentRoutes(gateway);
  registerRunRoutes(gateway, {
    store: new GatewayStore(),
    runAgent: (payload) =>
      workerRunner.runAgent({
        agent: payload.agent as GatewayWorkerName,
        messages: payload.messages
      })
  });

  const gatewayBaseUrl = await gateway.listen({
    host: "127.0.0.1",
    port: 0
  });

  const controlPlane = Fastify({ logger: false });
  const service = createOrchestratorService({
    acpClient: createHttpACPClient({ baseUrl: gatewayBaseUrl })
  });

  registerControlPlaneAgentRoutes(controlPlane, service);
  registerTaskRoutes(controlPlane, service);
  await controlPlane.ready();

  const created = await controlPlane.inject({
    method: "POST",
    url: "/api/tasks",
    payload: {
      title: "Build dashboard",
      prompt: "Create the dashboard task",
      allowMock: false,
      requiresApproval: true,
      sensitivity: "medium"
    }
  });

  const approved = await controlPlane.inject({
    method: "POST",
    url: `/api/tasks/${created.json().id}/approve`
  });

  await Promise.all([controlPlane.close(), gateway.close()]);

  return {
    created: created.json(),
    approved: approved.json()
  };
}
```

- [ ] **Step 5: Run the smoke test, full suite, and build**

Run: `pnpm exec vitest run apps/acp-gateway/src/smoke.test.ts && pnpm test && pnpm build`

Expected: PASS

- [ ] **Step 6: Commit the Phase 2 workflow wiring**

```bash
git add package.json pnpm-lock.yaml apps/acp-gateway/src/smoke.test.ts apps/acp-gateway/src/server.ts apps/control-plane/src/server.ts
git commit -m "Add Phase 2 collaboration smoke flow"
```

## Final Verification

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test`

Expected: PASS with all workspace tests green

- [ ] **Step 2: Run the production build**

Run: `pnpm build`

Expected: PASS with `@feudal/web` build output in `apps/web/dist`

- [ ] **Step 3: Verify the branch is clean**

Run: `git status --short`

Expected: no output
